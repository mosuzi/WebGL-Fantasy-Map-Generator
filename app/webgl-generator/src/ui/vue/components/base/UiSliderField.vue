<template>
  <label :class="fieldClass">
    <span>{{ label }}</span>
    <input
      :id="inputId || null"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="$emit('input', Number($event.target.value))"
    />
    <component :is="valueTag" :id="outputId || null" :for="inputId || null">{{ modelValue }}</component>
  </label>
</template>

<script setup>
defineOptions({
  name: "UiSliderField"
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
  outputId: {
    type: String,
    default: ""
  },
  modelValue: {
    type: Number,
    required: true
  },
  min: {
    type: Number,
    required: true
  },
  max: {
    type: Number,
    required: true
  },
  step: {
    type: Number,
    default: 1
  },
  fieldClass: {
    type: String,
    default: "height-range-field"
  },
  valueTag: {
    type: String,
    default: "strong"
  }
});

defineEmits(["input"]);
</script>
