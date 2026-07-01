<template>
  <label :class="fieldClass">
    <span>{{ label }}</span>
    <span class="ui-slider-shell">
      <input
        :id="inputId || null"
        ref="nativeInput"
        class="ui-slider-native"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="currentValue"
        tabindex="-1"
        aria-hidden="true"
        @input="onNativeInput"
        @change="onNativeInput"
      />
      <ElSlider
        class="ui-slider-el"
        :model-value="currentValue"
        :min="min"
        :max="max"
        :step="step"
        :show-tooltip="false"
        @input="commitValue"
        @change="commitValue"
      />
    </span>
    <component :is="valueTag" :id="outputId || null" :for="inputId || null">{{ displayValue ?? currentValue }}</component>
  </label>
</template>

<script setup>
import {nextTick, ref, watch} from "vue";

defineOptions({
  name: "UiSliderField"
});

const props = defineProps({
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
  displayValue: {
    type: [String, Number],
    default: null
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

const emit = defineEmits(["input"]);

const nativeInput = ref(null);
const currentValue = ref(clampValue(props.modelValue));

watch(() => props.modelValue, next => {
  currentValue.value = clampValue(next);
});

function onNativeInput(event) {
  commitValue(Number(event.target.value), {dispatchNative: false});
}

function commitValue(value, {dispatchNative = true} = {}) {
  const nextValue = clampValue(value);
  if (Object.is(nextValue, currentValue.value)) return;
  currentValue.value = nextValue;
  emit("input", nextValue);
  if (!dispatchNative || !props.inputId) return;
  nextTick(() => {
    const input = nativeInput.value;
    if (!input) return;
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
  });
}

function clampValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return props.min;
  return Math.min(props.max, Math.max(props.min, number));
}
</script>
