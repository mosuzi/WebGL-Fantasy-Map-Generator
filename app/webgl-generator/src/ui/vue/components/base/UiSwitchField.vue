<template>
  <label :class="[fieldClass, {'toggle-button-switch': buttonStyle}]">
    <input :id="inputId || null" type="checkbox" :checked="checked" @change="$emit('change', $event.target.checked)" />
    <span v-if="buttonStyle" class="layer-toggle-indicator"></span>
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
  },
  buttonStyle: {
    type: Boolean,
    default: false
  }
});

defineEmits(["change"]);
</script>
