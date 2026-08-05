<template>
  <div class="regeneration-lock-actions" role="toolbar" aria-label="重生成锁定批量操作">
    <span class="regeneration-lock-selection-count">已选 {{ selectedCount }} 项</span>
    <UiButton
      class="ui-icon-action regeneration-lock-action"
      variant="secondary"
      :active="batchSelectionMode"
      :title="batchSelectionMode ? '结束列表多选' : '列表多选'"
      :aria-label="batchSelectionMode ? '结束列表多选' : '列表多选'"
      :aria-pressed="batchSelectionMode ? 'true' : 'false'"
      circle
      @click="$emit('toggle-batch-mode')"
    >
      <ElIcon aria-hidden="true"><List /></ElIcon>
    </UiButton>
    <UiButton
      class="ui-icon-action regeneration-lock-action"
      variant="secondary"
      :active="mapSelectionActive"
      :title="mapSelectionActive ? '地图多选中' : '在地图多选'"
      :aria-label="mapSelectionActive ? '地图多选中' : '在地图多选'"
      :aria-pressed="mapSelectionActive ? 'true' : 'false'"
      circle
      @click="$emit('map-select')"
    >
      <ElIcon aria-hidden="true"><Location /></ElIcon>
    </UiButton>
    <UiButton
      class="ui-icon-action regeneration-lock-action"
      variant="secondary"
      title="锁定选中"
      aria-label="锁定选中"
      :disabled="!selectedCount"
      circle
      @click="$emit('lock')"
    >
      <ElIcon aria-hidden="true"><Lock /></ElIcon>
    </UiButton>
    <UiButton
      class="ui-icon-action regeneration-lock-action"
      variant="secondary"
      title="解锁选中"
      aria-label="解锁选中"
      :disabled="!selectedCount"
      circle
      @click="$emit('unlock')"
    >
      <ElIcon aria-hidden="true"><Unlock /></ElIcon>
    </UiButton>
    <UiButton
      class="ui-icon-action regeneration-lock-action"
      variant="secondary"
      title="清空选择"
      aria-label="清空选择"
      :disabled="!selectedCount"
      circle
      @click="$emit('clear')"
    >
      <ElIcon aria-hidden="true"><CircleClose /></ElIcon>
    </UiButton>
  </div>
</template>

<script setup>
import {CircleClose, List, Location, Lock, Unlock} from "@element-plus/icons-vue";
import UiButton from "./UiButton.vue";

defineOptions({name: "UiRegenerationLockActions"});
defineProps({
  selectedCount: {type: Number, default: 0},
  batchSelectionMode: {type: Boolean, default: false},
  mapSelectionActive: {type: Boolean, default: false}
});
defineEmits(["toggle-batch-mode", "map-select", "lock", "unlock", "clear"]);
</script>
