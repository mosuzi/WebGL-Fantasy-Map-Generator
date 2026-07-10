<template>
  <div :class="className">
    <UiButton variant="secondary" @click="$emit('undo')">撤销上次</UiButton>
    <UiButton variant="secondary" @click="$emit('redo')">重做上次</UiButton>
    <span>{{ note }}</span>
  </div>
</template>

<script setup>
import {computed} from "vue";
import {formatHistoryStats} from "../../../history-format.js";
import UiButton from "./UiButton.vue";

defineOptions({
  name: "UiHistoryActions"
});

const props = defineProps({
  className: {
    type: String,
    required: true
  },
  history: {
    type: Object,
    default: null
  },
  label: {
    type: String,
    default: "历史"
  },
  noteText: {
    type: String,
    default: ""
  }
});

defineEmits(["undo", "redo"]);

const note = computed(() => {
  if (props.noteText) return props.noteText;
  return `${props.label}：${formatHistoryStats(props.history)}`;
});
</script>
