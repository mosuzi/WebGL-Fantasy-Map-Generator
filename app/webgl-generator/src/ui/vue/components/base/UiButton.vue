<template>
  <ElButton class="ui-button" :data-layout-multiline="wrapReason || undefined" :native-type="buttonType" :disabled="disabled" :class="[variantClass, {active}]" @click="event => emit('click', event)">
    <slot />
  </ElButton>
</template>

<script setup>
import {computed} from "vue";

defineOptions({
  name: "UiButton"
});

const props = defineProps({
  // 仅内容卡片等确需分行的按钮声明原因；普通动作始终保持完整文案。
  wrapReason: {
    type: String,
    default: ""
  },
  variant: {
    type: String,
    default: "plain"
  },
  active: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  buttonType: {
    type: String,
    default: "button"
  }
});

const emit = defineEmits(["click"]);

const variantClass = computed(() => {
  if (props.variant === "primary") return "primary-action";
  if (props.variant === "secondary") return "secondary-action";
  if (props.variant === "danger") return "danger-action";
  return "";
});
</script>
