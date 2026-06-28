<template>
  <label :class="fieldClass">
    <input :id="inputId || null" type="checkbox" :checked="checked" @change="$emit('change', $event.target.checked)" />
    <span>{{ label }}</span>
  </label>
</template>

<script setup>
defineOptions({
  name: "UiSwitchField"
});

defineProps({
  label: {
    type: String,
    required: true
  },
  inputId: {
    type: String,
    default: ""
  },
  checked: {
    type: Boolean,
    default: false
  },
  fieldClass: {
    type: String,
    default: "generation-check-row"
  }
});

defineEmits(["change"]);
</script>
