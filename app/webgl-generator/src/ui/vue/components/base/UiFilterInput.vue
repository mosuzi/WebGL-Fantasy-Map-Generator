<template>
  <input
    type="search"
    :placeholder="placeholder"
    :value="modelValue"
    @compositionstart="composing = true"
    @compositionend="onCompositionEnd"
    @input="onInput"
  />
</template>

<script setup>
import {ref} from "vue";

defineOptions({
  name: "UiFilterInput"
});

defineProps({
  modelValue: {
    type: String,
    default: ""
  },
  placeholder: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["update:modelValue"]);
const composing = ref(false);

function onCompositionEnd(event) {
  composing.value = false;
  emit("update:modelValue", event.target.value);
}

function onInput(event) {
  if (composing.value || event.isComposing) return;
  emit("update:modelValue", event.target.value);
}
</script>
