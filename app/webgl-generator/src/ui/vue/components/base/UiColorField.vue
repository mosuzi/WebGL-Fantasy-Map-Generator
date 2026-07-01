<template>
  <form :class="className" @submit.prevent="$emit('apply', value)">
    <label>
      <span>{{ label }}</span>
      <ElColorPicker
        v-model="value"
        class="ui-color-picker"
        :predefine="predefinedColors"
        :teleported="true"
        :show-alpha="false"
        color-format="hex"
      />
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
const predefinedColors = [
  "#c94c4c",
  "#d7a84f",
  "#6aa56a",
  "#4f9cc9",
  "#7f6cc7",
  "#c86e9f",
  "#8aa6b0",
  "#d8d0bd"
];

watch(() => props.modelValue, next => {
  value.value = next || "#ffffff";
});
</script>
