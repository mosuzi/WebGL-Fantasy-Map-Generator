<template>
  <ElButton :native-type="buttonType" :disabled="disabled" :class="[variantClass, {active}]" @click="event => emit('click', event)">
    <slot />
  </ElButton>
</template>

<script setup>
import {computed} from "vue";

defineOptions({
  name: "UiButton"
});

const props = defineProps({
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
