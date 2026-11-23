<template>
  <div class="regeneration-lock-actions" role="toolbar" aria-label="重生成锁定批量操作">
    <span class="regeneration-lock-selection-count">已选 {{ selectedCount }} 项</span>
    <span class="regeneration-lock-selection-hint">Ctrl+点击多选</span>
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
      variant="secondary"
      title="锁定当前列表中的全部可锁项目"
      aria-label="全部锁定"
      :disabled="!canLockAll"
      @click="$emit('lock')"
    >
      <ElIcon aria-hidden="true"><Lock /></ElIcon><span>全部锁定</span>
    </UiButton>
    <UiButton
      variant="secondary"
      title="解锁当前列表中的全部已锁项目"
      aria-label="全部解锁"
      :disabled="!canUnlockAll"
      @click="$emit('unlock')"
    >
      <ElIcon aria-hidden="true"><Unlock /></ElIcon><span>全部解锁</span>
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
import {CircleClose, Location, Lock, Unlock} from "@element-plus/icons-vue";
import UiButton from "./UiButton.vue";

defineOptions({name: "UiRegenerationLockActions"});
defineProps({
  canLockAll: Boolean,
  canUnlockAll: Boolean,
  selectedCount: {type: Number, default: 0},
  mapSelectionActive: {type: Boolean, default: false}
});
defineEmits(["map-select", "lock", "unlock", "clear"]);
</script>
