<template>
  <div class="ui-panel-io-actions" :class="className" role="toolbar" :aria-label="label">
    <ElDropdown
      v-if="exportActions.length"
      trigger="click"
      popper-class="ui-panel-io-dropdown"
      :disabled="allExportDisabled"
      @command="handleExportCommand"
    >
      <ElButton
        class="ui-icon-action ui-panel-io-button"
        :disabled="allExportDisabled"
        circle
        title="导出"
        aria-label="导出"
      >
        <ElIcon><Download /></ElIcon>
      </ElButton>
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem
            v-for="action in exportActions"
            :key="action.key"
            :command="action.key"
            :disabled="action.disabled"
          >
            {{ action.label }}
          </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>

    <span v-for="action in importActions" :key="action.key" class="ui-panel-io-file-action">
      <ElButton
        class="ui-icon-action ui-panel-io-button"
        :disabled="action.disabled"
        circle
        :title="action.label"
        :aria-label="action.label"
        @click="triggerImport(action.key)"
      >
        <ElIcon><Upload /></ElIcon>
      </ElButton>
      <input
        :ref="element => setFileInput(action.key, element)"
        type="file"
        :accept="action.accept || ''"
        :disabled="action.disabled"
        @change="event => handleImportChange(action.key, event)"
      />
    </span>

    <ElButton
      v-for="action in actions"
      :key="action.key"
      class="ui-icon-action ui-panel-io-button"
      :disabled="action.disabled"
      circle
      :title="action.label"
      :aria-label="action.label"
      @click="emit('action', action.key)"
    >
      <span aria-hidden="true">{{ action.icon || "..." }}</span>
    </ElButton>
  </div>
</template>

<script setup>
import {computed, ref} from "vue";
import {Download, Upload} from "@element-plus/icons-vue";

defineOptions({
  name: "UiPanelIoActions"
});

const props = defineProps({
  label: {
    type: String,
    default: "导入导出"
  },
  className: {
    type: String,
    default: ""
  },
  exportActions: {
    type: Array,
    default: () => []
  },
  importActions: {
    type: Array,
    default: () => []
  },
  actions: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["export", "import", "action"]);
const fileInputs = ref(new Map());

const allExportDisabled = computed(() => props.exportActions.every(action => action.disabled));

function handleExportCommand(key) {
  const action = props.exportActions.find(item => item.key === key);
  if (!action || action.disabled) return;
  emit("export", key);
}

function setFileInput(key, element) {
  if (element) fileInputs.value.set(key, element);
  else fileInputs.value.delete(key);
}

function triggerImport(key) {
  const action = props.importActions.find(item => item.key === key);
  if (!action || action.disabled) return;
  const input = fileInputs.value.get(key);
  if (!input) return;
  input.value = "";
  input.click();
}

function handleImportChange(key, event) {
  const file = event.target.files?.[0];
  if (!file) return;
  emit("import", {key, file});
  event.target.value = "";
}
</script>
