<template>
  <label :class="[fieldClass, 'ui-slider-field', unitText ? 'ui-slider-field-has-unit' : 'ui-slider-field-no-unit']">
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
        @change="onNativeChange"
      />
      <ElSlider
        class="ui-slider-el"
        :model-value="currentValue"
        :min="min"
        :max="max"
        :step="step"
        :show-tooltip="false"
        @input="updateValue"
        @change="commitValue"
      />
    </span>
    <ElInputNumber
      class="ui-slider-number"
      :model-value="currentValue"
      :min="min"
      :max="max"
      :step="step"
      :step-strictly="true"
      :precision="inputPrecision"
      controls-position="right"
      size="small"
      @update:model-value="updateValue"
      @change="commitValue"
    />
    <component
      :is="valueTag"
      v-if="outputId || unitText"
      :id="outputId || null"
      class="ui-slider-unit"
      :for="inputId || null"
      :aria-hidden="unitText ? null : 'true'"
    >
      {{ unitText }}
    </component>
  </label>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";

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
  unitLabel: {
    type: String,
    default: ""
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

const emit = defineEmits(["input", "change"]);

const nativeInput = ref(null);
const currentValue = ref(clampValue(props.modelValue));
const inputPrecision = computed(() => decimalPlaces(props.step));
const unitText = computed(() => props.unitLabel.trim());

watch(() => props.modelValue, next => {
  currentValue.value = clampValue(next);
});

function onNativeInput(event) {
  updateValue(Number(event.target.value), {syncNative: false});
}

function onNativeChange(event) {
  commitValue(Number(event.target.value), {syncNative: false});
}

function updateValue(value, {syncNative = true, emitInput = true} = {}) {
  const nextValue = clampValue(value);
  const changed = !Object.is(nextValue, currentValue.value);
  if (changed) {
    currentValue.value = nextValue;
    if (emitInput) emit("input", nextValue);
  }
  if (syncNative && props.inputId) syncNativeValue(nextValue);
  return nextValue;
}

function commitValue(value, options = {}) {
  const nextValue = updateValue(value, options);
  emit("change", nextValue);
  if (options.syncNative === false || !props.inputId) return;
  dispatchNativeChange(nextValue);
}

function syncNativeValue(nextValue) {
  nextTick(() => {
    const input = nativeInput.value;
    if (!input) return;
    input.value = String(nextValue);
  });
}

function dispatchNativeChange(nextValue) {
  nextTick(() => {
    const input = nativeInput.value;
    if (!input) return;
    input.value = String(nextValue);
    input.dispatchEvent(new Event("change", {bubbles: true}));
  });
}

function clampValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return props.min;
  const clamped = Math.min(props.max, Math.max(props.min, number));
  return roundToStep(clamped);
}

function roundToStep(value) {
  const step = Number(props.step);
  if (!Number.isFinite(step) || step <= 0) return value;
  const min = Number(props.min) || 0;
  const precision = decimalPlaces(step);
  const rounded = min + Math.round((value - min) / step) * step;
  return Number(rounded.toFixed(Math.min(8, precision + 2)));
}

function decimalPlaces(value) {
  const text = String(value);
  if (!text.includes(".")) return 0;
  return text.split(".")[1]?.length || 0;
}
</script>
