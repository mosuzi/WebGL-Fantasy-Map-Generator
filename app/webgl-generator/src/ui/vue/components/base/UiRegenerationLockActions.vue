<template>
  <div class="regeneration-lock-actions" role="toolbar" aria-label="重生成锁定批量操作">
    <span class="regeneration-lock-selection-count">已选 {{ selectedCount }} 项</span>
    <UiButton variant="secondary" :active="batchSelectionMode" @click="$emit('toggle-batch-mode')">
      {{ batchSelectionMode ? "结束列表多选" : "列表多选" }}
    </UiButton>
    <UiButton variant="secondary" :active="mapSelectionActive" @click="$emit('map-select')">
      {{ mapSelectionActive ? "地图多选中" : "在地图多选" }}
    </UiButton>
    <UiButton variant="secondary" :disabled="!selectedCount" @click="$emit('lock')">锁定选中</UiButton>
    <UiButton variant="secondary" :disabled="!selectedCount" @click="$emit('unlock')">解锁选中</UiButton>
    <UiButton variant="secondary" :disabled="!selectedCount" @click="$emit('clear')">清空选择</UiButton>
  </div>
</template>

<script setup>
import UiButton from "./UiButton.vue";

defineOptions({name: "UiRegenerationLockActions"});
defineProps({
  selectedCount: {type: Number, default: 0},
  batchSelectionMode: {type: Boolean, default: false},
  mapSelectionActive: {type: Boolean, default: false}
});
defineEmits(["toggle-batch-mode", "map-select", "lock", "unlock", "clear"]);
</script>
