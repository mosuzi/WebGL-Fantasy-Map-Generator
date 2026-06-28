<template>
  <button :type="buttonType" :class="[variantClass, {active}]">
    <slot />
  </button>
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
  buttonType: {
    type: String,
    default: "button"
  }
});

const variantClass = computed(() => {
  if (props.variant === "primary") return "primary-action";
  if (props.variant === "secondary") return "secondary-action";
  return "";
});
</script>
