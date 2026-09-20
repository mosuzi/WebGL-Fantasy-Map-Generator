<template>
  <div :class="['ui-sort-bar', className]">
    <UiButton
      v-for="option in visibleOptions"
      :key="option.key"
      variant="secondary"
      :active="activeKey === option.key"
      @click="$emit('sort', option.key)"
    >
      {{ labelFor(option) }}
    </UiButton>
  </div>
</template>

<script setup>
import {computed} from "vue";
import {useDebugMode} from "../../composables/use-debug-mode.js";
import {visibleListFields} from "../../composables/list-visibility.js";
import UiButton from "./UiButton.vue";

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
const debugEnabled = useDebugMode();
const visibleOptions = computed(() => visibleListFields(props.options, debugEnabled.value));

function labelFor(option) {
  return option.key === props.activeKey ? `${option.label} ${props.direction === "asc" ? "↑" : "↓"}` : option.label;
}
</script>
