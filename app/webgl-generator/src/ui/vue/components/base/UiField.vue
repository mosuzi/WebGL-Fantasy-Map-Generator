<template>
  <label :class="fieldClass">
    <span>{{ label }}</span>
    <select v-if="type === 'select'" :id="inputId" :value="modelValue">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <input
      v-else
      :id="inputId"
      :type="type"
      :value="modelValue"
      v-bind="inputAttrs"
    />
  </label>
</template>

<script setup>
defineOptions({
  name: "UiField"
});

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
