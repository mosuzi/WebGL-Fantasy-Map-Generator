<template>
  <form :class="className" @submit.prevent="$emit('apply', normalizedValue)">
    <label>
      <span>{{ label }}</span>
      <input v-model.number="value" type="number" :min="min" :max="max" :step="step" />
    </label>
    <UiButton variant="secondary" button-type="submit">{{ actionLabel }}</UiButton>
  </form>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import UiButton from "./UiButton.vue";

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
  actionLabel: {
    type: String,
    default: "应用"
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

defineEmits(["apply"]);

const value = ref(props.modelValue);
const normalizedValue = computed(() => Number(value.value));

watch(() => props.modelValue, next => {
  value.value = Number(next) || 0;
});
</script>
