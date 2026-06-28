<template>
  <button
    type="button"
    class="layer-toggle-button"
    :class="{active: pressed}"
    :data-layer="layer"
    :aria-pressed="pressed ? 'true' : 'false'"
  >
    <span class="layer-toggle-indicator"></span>
    <span>{{ label }}</span>
  </button>
</template>

<script setup>
defineOptions({
  name: "UiLayerToggleButton"
});

defineProps({
  layer: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  pressed: {
    type: Boolean,
    default: true
  }
});
</script>
