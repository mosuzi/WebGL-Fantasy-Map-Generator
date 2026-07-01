<template>
  <UiSelectField
    v-if="type === 'select'"
    :label="label"
    :input-id="inputId"
    :model-value="modelValue"
    :options="options"
    :class-name="fieldClass"
    @update:model-value="$emit('update:modelValue', $event)"
  />
  <label v-else :class="fieldClass">
    <span>{{ label }}</span>
    <input
      :id="inputId"
      :type="type"
      :value="modelValue"
      v-bind="inputAttrs"
    />
  </label>
</template>

<script setup>
import UiSelectField from "./UiSelectField.vue";

defineOptions({
  name: "UiField"
});

defineEmits(["update:modelValue"]);

defineProps({
  label: {
    type: String,
    required: true
  },
  inputId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: "text"
  },
  modelValue: {
    type: [String, Number],
    default: ""
  },
  options: {
    type: Array,
    default: () => []
  },
  inputAttrs: {
    type: Object,
    default: () => ({})
  },
  fieldClass: {
    type: String,
    default: "generation-field-row"
  }
});
</script>
