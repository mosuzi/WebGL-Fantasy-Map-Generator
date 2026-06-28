<template>
  <form :class="className" @submit.prevent="$emit('apply', value)">
    <label>
      <span>{{ label }}</span>
      <input v-model="value" type="color" />
      <strong>{{ value }}</strong>
    </label>
    <UiButton variant="secondary" button-type="submit">{{ actionLabel }}</UiButton>
  </form>
</template>

<script setup>
import {ref, watch} from "vue";
import UiButton from "./UiButton.vue";

defineOptions({
  name: "UiColorField"
});

const props = defineProps({
  modelValue: {
    type: String,
    default: "#ffffff"
  },
  label: {
    type: String,
    default: "颜色"
  },
  actionLabel: {
    type: String,
    default: "应用颜色"
  },
  className: {
    type: String,
    default: "object-color-editor"
  }
});

defineEmits(["apply"]);

const value = ref(props.modelValue || "#ffffff");
watch(() => props.modelValue, next => {
  value.value = next || "#ffffff";
});
</script>
