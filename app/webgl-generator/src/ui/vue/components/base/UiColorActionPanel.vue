<template>
  <div class="ui-color-action-panel">
    <UiColorField :class-name="className" :model-value="modelValue" @apply="color => emit('apply', color)" />
  </div>
</template>

<script setup>
import UiColorField from "./UiColorField.vue";

defineOptions({
  name: "UiColorActionPanel"
});

defineProps({
  modelValue: {
    type: String,
    default: "#8aa6b0"
  },
  className: {
    type: String,
    default: "shared-color-field"
  }
});

const emit = defineEmits(["apply"]);
</script>
