<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="{active: modelValue === option.value}"
      :data-mode="dataMode ? option.value : null"
      @click="$emit('select', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
defineOptions({
  name: "UiSegmented"
});

defineProps({
  label: {
    type: String,
    default: "选项"
  },
  options: {
    type: Array,
    required: true
  },
  modelValue: {
    type: String,
    required: true
  },
  dataMode: {
    type: Boolean,
    default: false
  }
});

defineEmits(["select"]);
</script>
