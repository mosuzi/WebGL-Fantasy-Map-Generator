<template>
  <div class="segmented ui-segmented" role="group" :aria-label="label">
    <ElSegmented
      class="ui-segmented-el"
      :model-value="currentValue"
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
      @click="commitValue(option.value, {dispatchBridge: false})"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import {nextTick, ref, watch} from "vue";

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

watch(() => props.modelValue, value => {
  currentValue.value = value;
});

function commitValue(value, {dispatchBridge = true} = {}) {
  if (value === currentValue.value) return;
  currentValue.value = value;
  emit("select", value);
  if (!props.dataMode || !dispatchBridge) return;
  nextTick(() => {
    const button = bridgeButtons.value.find(item => item?.dataset?.mode === String(value));
    button?.dispatchEvent(new MouseEvent("click", {bubbles: true}));
  });
}
</script>
