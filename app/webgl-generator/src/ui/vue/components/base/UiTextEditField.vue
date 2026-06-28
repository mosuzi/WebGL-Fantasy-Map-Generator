<template>
  <form :class="className" @submit.prevent="$emit('apply', value)">
    <label>
      <span>{{ label }}</span>
      <input v-model="value" type="text" :maxlength="maxLength" />
    </label>
    <UiButton variant="secondary" button-type="submit">{{ actionLabel }}</UiButton>
  </form>
</template>

<script setup>
import {watch, ref} from "vue";
import UiButton from "./UiButton.vue";

defineOptions({
  name: "UiTextEditField"
});

const props = defineProps({
  modelValue: {
    type: String,
    default: ""
  },
  label: {
    type: String,
    default: "名称"
  },
  actionLabel: {
    type: String,
    default: "应用名称"
  },
  maxLength: {
    type: Number,
    default: 48
  },
  className: {
    type: String,
    default: "object-name-editor"
  }
});

defineEmits(["apply"]);

const value = ref(props.modelValue);
watch(() => props.modelValue, next => {
  value.value = next || "";
});
</script>
