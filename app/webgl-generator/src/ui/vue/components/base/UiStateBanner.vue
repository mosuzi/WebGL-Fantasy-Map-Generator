<template>
  <section class="ui-state-banner" :class="`is-${kind}`" :data-ui-state="kind" :role="kind === 'error' || kind === 'orphan' ? 'alert' : 'status'">
    <div class="ui-state-banner-copy">
      <span class="ui-state-token">{{ stateLabel }}</span>
      <strong>{{ title }}</strong>
      <p v-if="message">{{ message }}</p>
    </div>
    <div v-if="actionLabel || secondaryActionLabel" class="ui-state-banner-actions">
      <UiButton v-if="secondaryActionLabel" variant="secondary" @click="emit('secondary-action')">{{ secondaryActionLabel }}</UiButton>
      <UiButton v-if="actionLabel" variant="secondary" @click="emit('action')">{{ actionLabel }}</UiButton>
    </div>
  </section>
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./UiButton.vue";

defineOptions({
  name: "UiStateBanner"
});

const props = defineProps({
  kind: {
    type: String,
    required: true,
    validator: value => ["selected", "editing", "preview", "success", "stale", "empty", "error", "orphan"].includes(value)
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    default: ""
  },
  actionLabel: {
    type: String,
    default: ""
  },
  secondaryActionLabel: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["action", "secondary-action"]);
const stateLabel = computed(() => ({
  selected: "已选中",
  editing: "编辑中",
  preview: "预览中",
  success: "已完成",
  stale: "待派生",
  empty: "暂无数据",
  error: "操作失败",
  orphan: "孤儿对象"
})[props.kind]);
</script>
