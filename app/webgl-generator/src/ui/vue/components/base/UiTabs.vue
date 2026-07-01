<template>
  <ElTabs
    class="control-panel-tabs"
    :model-value="modelValue"
    stretch
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <ElTabPane v-for="tab in tabs" :key="tab.id" :name="tab.id">
      <template #label>
        <span :data-control-tab="tab.id">{{ tab.label }}</span>
      </template>
    </ElTabPane>
  </ElTabs>
</template>

<script setup>
defineOptions({
  name: "UiTabs"
});

defineProps({
  tabs: {
    type: Array,
    required: true
  },
  modelValue: {
    type: String,
    required: true
  }
});

defineEmits(["update:modelValue"]);
</script>
