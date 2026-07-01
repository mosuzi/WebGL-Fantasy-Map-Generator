<template>
  <div :class="['ui-select-field', className, {'is-disabled': disabled, 'is-open': open}]">
    <span :id="labelId" class="ui-select-label">{{ label }}</span>
    <span ref="root" class="ui-select-shell">
      <select
        :id="inputId || null"
        class="ui-select-native"
        :value="stringValue(currentValue)"
        :disabled="disabled"
        tabindex="-1"
        aria-hidden="true"
        @change="onNativeChange"
      >
        <option
          v-for="option in options"
          :key="stringValue(optionValue(option))"
          :value="stringValue(optionValue(option))"
        >
          {{ optionLabel(option) }}
        </option>
      </select>

      <ElSelect
        class="ui-select-el"
        :model-value="currentValue"
        :disabled="disabled"
        :placeholder="'请选择'"
        :teleported="true"
        popper-class="ui-select-popper"
        :aria-labelledby="labelId"
        @update:model-value="commitValue"
        @visible-change="open = $event"
      >
        <ElOption
          v-for="option in options"
          :key="stringValue(optionValue(option))"
          :label="optionLabel(option)"
          :value="optionValue(option)"
        />
      </ElSelect>
    </span>
  </div>
</template>

<script setup>
import {nextTick, ref, watch} from "vue";

defineOptions({
  name: "UiSelectField"
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
  modelValue: {
    type: [String, Number, Boolean],
    default: ""
  },
  options: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  },
  className: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["update:modelValue", "change"]);

const root = ref(null);
const open = ref(false);
const currentValue = ref(normalizeValue(props.modelValue));
const instanceId = `ui-select-${Math.random().toString(36).slice(2, 10)}`;
const labelId = `${instanceId}-label`;

watch(() => props.modelValue, next => {
  currentValue.value = normalizeValue(next);
});

watch(() => props.options, () => {
  currentValue.value = normalizeValue(currentValue.value);
});

function onNativeChange(event) {
  commitValue(event.target.value, {dispatchNative: false});
}

function commitValue(value, {dispatchNative = true} = {}) {
  const normalized = normalizeValue(value);
  if (stringValue(normalized) === stringValue(currentValue.value)) return;
  currentValue.value = normalized;
  emit("update:modelValue", normalized);
  emit("change", normalized);
  if (!dispatchNative || !props.inputId) return;
  nextTick(() => {
    const select = root.value?.querySelector("select");
    if (!select) return;
    select.value = stringValue(normalized);
    select.dispatchEvent(new Event("change", {bubbles: true}));
  });
}

function normalizeValue(value) {
  const selected = props.options.find(option => stringValue(optionValue(option)) === stringValue(value));
  return selected ? optionValue(selected) : value ?? "";
}

function optionValue(option) {
  return option?.value ?? option?.id ?? option?.burgId ?? option?.key ?? "";
}

function optionLabel(option) {
  return option?.label ?? option?.name ?? String(optionValue(option));
}

function stringValue(value) {
  return value === null || value === undefined ? "" : String(value);
}
</script>
