<template>
  <div :class="className" data-ui-text-edit-field :data-ui-committed-value="modelValue" @keydown.enter="applyOnEnter" @compositionstart="composing = true" @compositionend="composing = false">
    <label>
      <span>{{ label }}</span>
      <ElInput v-model="value" type="text" :maxlength="maxLength" :placeholder="label" :aria-label="label" aria-keyshortcuts="Enter" title="按回车或离开输入框保存" @input="lastEnterValue = null" @blur="applyOnBlur" />
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
const lastEnterValue = ref(null);
watch(() => props.modelValue, next => {
  value.value = next || "";
});

function applyOnEnter(event) {
  if (event.target?.tagName !== "INPUT") return;
  event.preventDefault();
  if (composing.value || event.isComposing || event.keyCode === 229) {
    event.stopPropagation();
    return;
  }
  lastEnterValue.value = event.target.value;
  emit("apply", event.target.value);
}

function applyOnBlur(event) {
  if (composing.value || event?.target?.tagName !== "INPUT"
    || event.target.closest("[data-ui-text-edit-field]")?.hasAttribute("data-ui-skip-blur-commit")) return;
  const submitted = event.target.value;
  if (submitted === lastEnterValue.value) {
    lastEnterValue.value = null;
    return;
  }
  emit("apply", submitted);
}
</script>
