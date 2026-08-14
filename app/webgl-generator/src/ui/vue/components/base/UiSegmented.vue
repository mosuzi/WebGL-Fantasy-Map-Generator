<template>
  <div class="segmented ui-segmented" role="group" :aria-label="label">
    <ElSegmented
      class="ui-segmented-el"
      :model-value="displayValue"
      :options="options"
      block
      size="small"
      :aria-label="label"
      @update:model-value="commitValue"
    />
    <button
      v-for="option in options"
      :key="`bridge-${option.value}`"
      ref="bridgeButtons"
      type="button"
      class="ui-segmented-mode-bridge"
      :class="{active: modelValue === option.value}"
      :data-mode="dataMode ? option.value : null"
      tabindex="-1"
      aria-hidden="true"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";

defineOptions({
  name: "UiSegmented"
});

const props = defineProps({
  label: {
    type: String,
    default: "选项"
  },
  options: {
    type: Array,
    required: true
  },
  modelValue: {
    type: String,
    required: true
  },
  dataMode: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["select"]);
const currentValue = ref(props.modelValue);
const bridgeButtons = ref([]);
const displayValue = computed(() => props.dataMode ? props.modelValue : currentValue.value);

watch(() => props.modelValue, value => {
  currentValue.value = value;
});

function commitValue(value) {
  if (value === displayValue.value) return;
  if (!props.dataMode) {
    currentValue.value = value;
    emit("select", value);
    return;
  }
  nextTick(() => {
    const button = bridgeButtons.value.find(item => item?.dataset?.mode === String(value));
    button?.dispatchEvent(new MouseEvent("click", {bubbles: true}));
  });
}
</script>
