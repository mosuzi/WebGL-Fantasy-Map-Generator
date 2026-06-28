<template>
  <div :class="className">
    <button
      v-for="option in options"
      :key="option.key"
      type="button"
      :class="{active: activeKey === option.key}"
      @click="$emit('sort', option.key)"
    >
      {{ labelFor(option) }}
    </button>
  </div>
</template>

<script setup>
defineOptions({
  name: "UiSortBar"
});

const props = defineProps({
  className: {
    type: String,
    required: true
  },
  options: {
    type: Array,
    required: true
  },
  activeKey: {
    type: String,
    required: true
  },
  direction: {
    type: String,
    default: "asc"
  }
});

defineEmits(["sort"]);

function labelFor(option) {
  return option.key === props.activeKey ? `${option.label} ${props.direction === "asc" ? "↑" : "↓"}` : option.label;
}
</script>
