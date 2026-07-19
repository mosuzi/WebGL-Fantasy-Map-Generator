<template>
  <div :class="[fieldClass, {'toggle-button-switch': buttonStyle, 'is-checked': currentChecked, 'compact-hit-area': compactHitArea}]" @click="toggleFromRow">
    <input
      :id="inputId || null"
      ref="nativeInput"
      class="ui-switch-native"
      type="checkbox"
      :checked="currentChecked"
      tabindex="-1"
      aria-hidden="true"
      @change="onNativeChange"
    />
    <ElSwitch
      class="ui-switch-el"
      :model-value="currentChecked"
      :aria-label="label"
      @change="commitValue"
    />
    <span class="ui-switch-label">{{ label }}</span>
  </div>
</template>

<script setup>
import {nextTick, ref, watch} from "vue";

defineOptions({
  name: "UiSwitchField"
});

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  inputId: {
    type: String,
    default: ""
  },
  checked: {
    type: Boolean,
    default: false
  },
  fieldClass: {
    type: String,
    default: "generation-check-row"
  },
  buttonStyle: {
    type: Boolean,
    default: false
  },
  compactHitArea: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["change"]);

const nativeInput = ref(null);
const currentChecked = ref(Boolean(props.checked));

watch(() => props.checked, next => {
  currentChecked.value = Boolean(next);
});

function toggleFromRow(event) {
  if (event.target.closest?.(".el-switch")) return;
  if (props.compactHitArea && !event.target.closest?.(".ui-switch-label")) return;
  commitValue(!currentChecked.value);
}

function onNativeChange(event) {
  commitValue(Boolean(event.target.checked), {dispatchNative: false});
}

function commitValue(value, {dispatchNative = true} = {}) {
  const nextValue = Boolean(value);
  if (nextValue === currentChecked.value) return;
  currentChecked.value = nextValue;
  emit("change", nextValue);
  if (!dispatchNative || !props.inputId) return;
  nextTick(() => {
    const input = nativeInput.value;
    if (!input) return;
    input.checked = nextValue;
    input.dispatchEvent(new Event("change", {bubbles: true}));
  });
}
</script>
