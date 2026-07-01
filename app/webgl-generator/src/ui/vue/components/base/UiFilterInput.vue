<template>
  <ElInput
    class="ui-filter-input"
    type="search"
    :placeholder="placeholder"
    :model-value="modelValue"
    clearable
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup>
defineOptions({
  name: "UiFilterInput"
});

defineProps({
  modelValue: {
    type: String,
    default: ""
  },
  placeholder: {
    type: String,
    default: ""
  }
});

defineEmits(["update:modelValue"]);
</script>
