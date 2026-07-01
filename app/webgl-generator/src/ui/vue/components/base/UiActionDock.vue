<template>
  <div class="ui-action-dock">
    <div class="ui-action-icon-row" role="toolbar" aria-label="对象操作">
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        class="ui-icon-action"
        :class="{active: action.key === active}"
        :disabled="action.disabled"
        :title="action.label"
        :aria-label="action.label"
        @click="toggleAction(action)"
      >
        <span aria-hidden="true">{{ action.icon }}</span>
      </button>
    </div>

    <div v-if="active" class="ui-action-content">
      <slot :name="active" />
    </div>
  </div>
</template>

<script setup>
defineOptions({
  name: "UiActionDock"
});

const props = defineProps({
  actions: {
    type: Array,
    required: true
  },
  active: {
    type: [String, null],
    default: null
  }
});

const emit = defineEmits(["update:active", "select"]);

function toggleAction(action) {
  if (action.disabled) return;
  const next = action.key === props.active ? null : action.key;
  emit("update:active", next);
  emit("select", next);
}
</script>
