<template>
  <div :class="className" @keydown.enter="applyOnEnter" @compositionstart="composing = true" @compositionend="composing = false">
    <label>
      <span>{{ label }}</span>
      <ElInputNumber v-model="value" v-bind="numberAttrs" controls-position="right" aria-keyshortcuts="Enter" title="按回车确认数值" @update:model-value="onValueUpdate" />
    </label>
  </div>
</template>

<script setup>
import {computed, ref, watch} from "vue";

defineOptions({
  name: "UiNumberField"
});

const props = defineProps({
  modelValue: {
    type: Number,
    default: 0
  },
  label: {
    type: String,
    default: "数值"
  },
  min: {
    type: Number,
    default: null
  },
  max: {
    type: Number,
    default: null
  },
  step: {
    type: Number,
    default: 1
  },
  className: {
    type: String,
    default: "object-number-editor"
  }
});

const emit = defineEmits(["apply", "update:modelValue"]);

const value = ref(props.modelValue);
const composing = ref(false);
const normalizedValue = computed(() => Number(value.value));
const numberAttrs = computed(() => ({
  ...(props.min !== null ? {min: props.min} : {}),
  ...(props.max !== null ? {max: props.max} : {}),
  step: props.step
}));

watch(() => props.modelValue, next => {
  value.value = Number(next) || 0;
});

function onValueUpdate(next) {
  const number = Number(next);
  if (Number.isFinite(number)) emit("update:modelValue", number);
}

function applyOnEnter(event) {
  if (event.target?.tagName !== "INPUT") return;
  event.preventDefault();
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  emit("apply", normalizedValue.value);
}
</script>
