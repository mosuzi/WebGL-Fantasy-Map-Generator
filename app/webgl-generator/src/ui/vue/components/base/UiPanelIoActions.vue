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
      v-for="action in safeActions"
      :key="action.key"
      class="ui-icon-action ui-panel-io-button"
      :class="{active: action.active}"
      :disabled="action.disabled"
      circle
      :title="action.label"
      :aria-label="action.label"
      @click="emit('action', action.key)"
    >
      <ElIcon v-if="resolveActionIcon(action)" aria-hidden="true"><component :is="resolveActionIcon(action)" /></ElIcon>
      <span v-else aria-hidden="true">{{ action.icon || "..." }}</span>
    </ElButton>

    <span v-if="dangerActions.length && hasSafeToolbarActions" class="ui-panel-action-divider" aria-hidden="true"></span>

    <ElButton
      v-for="action in dangerActions"
      :key="action.key"
      class="ui-icon-action ui-panel-io-button ui-panel-danger-action"
      :class="{active: action.active}"
      :disabled="action.disabled"
      circle
      :title="action.label"
      :aria-label="action.label"
      @click="emit('action', action.key)"
    >
      <ElIcon v-if="resolveActionIcon(action)" aria-hidden="true"><component :is="resolveActionIcon(action)" /></ElIcon>
      <span v-else aria-hidden="true">{{ action.icon || "..." }}</span>
    </ElButton>
  </div>
</template>

<script setup>
import {computed, ref} from "vue";
import {Brush, Delete, Document, Download, EditPen, Hide, Location, Plus, Rank, Refresh, Upload, View} from "@element-plus/icons-vue";

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
const safeActions = computed(() => props.actions.filter(action => !isDangerAction(action)));
const dangerActions = computed(() => props.actions.filter(action => isDangerAction(action)));
const hasSafeToolbarActions = computed(() => Boolean(props.exportActions.length || props.importActions.length || safeActions.value.length));

const ICON_RULES = Object.freeze([
  [/locate/, Location],
  [/^(add|create|new)/, Plus],
  [/delete|remove/, Delete],
  [/regenerate|rebuild|refresh/, Refresh],
  [/rename|edit/, EditPen],
  [/highlight-selected/, View],
  [/clear-highlights/, Hide],
  [/move|station/, Rank],
  [/note|report|archive/, Document],
  [/color|visual|style/, Brush]
]);

function handleExportCommand(key) {
  const action = props.exportActions.find(item => item.key === key);
  if (!action || action.disabled) return;
  emit("export", key);
}

function isDangerAction(action) {
  if (action?.tone === "danger" || action?.danger === true) return true;
  const key = String(action?.key || "");
  if (/^(delete|remove|regenerate|rebuild|replace)/.test(key)) return true;
  return /^(删除|批量删除|重新生成|重生成|重算|替换|批量覆盖|清空战报|清空事件)/.test(String(action?.label || ""));
}

function resolveActionIcon(action) {
  const key = String(action?.key || "");
  return ICON_RULES.find(([pattern]) => pattern.test(key))?.[1] || null;
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
