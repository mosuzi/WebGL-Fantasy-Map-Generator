<template>
  <UiButton id="open-generation-panel" variant="primary">控制面板</UiButton>
  <UiButton id="fit-view" variant="secondary">适配视图</UiButton>
  <UiButton id="toggle-measurement" variant="secondary" aria-pressed="false">测量</UiButton>
  <UiButton id="open-development-panel" class="debug-action" variant="secondary" hidden>开发模式</UiButton>
</template>

<script setup>
import UiButton from "./base/UiButton.vue";

defineOptions({
  name: "MapToolbar"
});
</script>
