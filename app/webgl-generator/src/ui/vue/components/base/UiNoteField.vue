<template>
  <form :class="className" @submit.prevent="apply">
    <label>
      <span>{{ label }}</span>
      <ElInput
        v-model="value"
        type="textarea"
        :rows="rows"
        :maxlength="maxLength"
        resize="vertical"
        show-word-limit
      />
    </label>
    <div class="ui-note-actions">
      <UiButton variant="secondary" button-type="submit">{{ actionLabel }}</UiButton>
      <UiButton variant="secondary" @click="clear">清空</UiButton>
    </div>
  </form>
</template>

<script setup>
import {ref, watch} from "vue";
import UiButton from "./UiButton.vue";

defineOptions({
  name: "UiNoteField"
});

const props = defineProps({
  modelValue: {
    type: String,
    default: ""
  },
  label: {
    type: String,
    default: "备注"
  },
  actionLabel: {
    type: String,
    default: "应用备注"
  },
  rows: {
    type: Number,
    default: 5
  },
  maxLength: {
    type: Number,
    default: 1000
  },
  className: {
    type: String,
    default: "ui-note-field"
  }
});

const emit = defineEmits(["apply", "clear"]);
const value = ref(props.modelValue || "");

watch(() => props.modelValue, next => {
  value.value = next || "";
});

function apply() {
  emit("apply", value.value);
}

function clear() {
  value.value = "";
  emit("clear");
}
</script>
