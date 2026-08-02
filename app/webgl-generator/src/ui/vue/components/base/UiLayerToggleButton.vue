<template>
  <ElButton
    class="layer-toggle-button"
    :class="{active: state === 'true', mixed: state === 'mixed'}"
    :data-layer="layers.length ? null : layer"
    :data-layer-group="layers.length ? layers.join(',') : null"
    :aria-pressed="state"
  >
    <span class="layer-toggle-indicator"></span>
    <span>{{ label }}</span>
  </ElButton>
</template>

<script setup>
import {computed} from "vue";

defineOptions({
  name: "UiLayerToggleButton"
});

const props = defineProps({
  layer: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  pressed: {
    type: [Boolean, String],
    default: true
  },
  layers: {
    type: Array,
    default: () => []
  }
});

const state = computed(() => props.pressed === "mixed" ? "mixed" : props.pressed ? "true" : "false");
</script>
