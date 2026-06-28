<template>
  <div class="control-panel-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :class="{active: modelValue === tab.id}"
      :data-control-tab="tab.id"
      @click="$emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
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
