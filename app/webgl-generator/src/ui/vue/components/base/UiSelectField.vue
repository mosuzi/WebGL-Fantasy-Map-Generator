<template>
  <label :class="['ui-select-field', className, {'is-disabled': disabled}]">
    <span class="ui-select-label">{{ label }}</span>
    <span class="ui-select-shell">
      <select
        :id="inputId || null"
        :value="stringValue(modelValue)"
        :disabled="disabled"
        @change="onChange"
      >
        <option
          v-for="option in options"
          :key="stringValue(optionValue(option))"
          :value="stringValue(optionValue(option))"
        >
          {{ optionLabel(option) }}
        </option>
      </select>
      <i class="ui-select-arrow" aria-hidden="true"></i>
    </span>
  </label>
</template>

<script setup>
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

function onChange(event) {
  const selected = props.options.find(option => stringValue(optionValue(option)) === event.target.value);
  const value = selected ? optionValue(selected) : event.target.value;
  emit("update:modelValue", value);
  emit("change", value);
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
