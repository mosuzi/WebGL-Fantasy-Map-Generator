<template>
  <div :class="className" @keydown.enter="applyOnEnter" @compositionstart="composing = true" @compositionend="composing = false">
    <label>
      <span>{{ label }}</span>
      <ElInput v-model="value" type="text" :maxlength="maxLength" aria-keyshortcuts="Enter" title="按回车保存" />
    </label>
  </div>
</template>

<script setup>
import {watch, ref} from "vue";

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
  maxLength: {
    type: Number,
    default: 48
  },
  className: {
    type: String,
    default: "object-name-editor"
  }
});

const emit = defineEmits(["apply"]);

const value = ref(props.modelValue);
const composing = ref(false);
watch(() => props.modelValue, next => {
  value.value = next || "";
});

function applyOnEnter(event) {
  if (event.target?.tagName !== "INPUT") return;
  event.preventDefault();
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  emit("apply", event.target.value);
}
</script>
