<template>
  <div class="measurement-readout-controls">
    <strong>测量</strong>
    <UiButton id="measurement-route-fit" variant="secondary" aria-pressed="false">自由</UiButton>
    <UiButton id="measurement-save">保存</UiButton>
    <UiButton id="measurement-objects">对象</UiButton>
    <UiButton id="measurement-export">导出</UiButton>
    <UiButton id="measurement-undo">撤销点</UiButton>
    <UiButton id="measurement-clear">清除</UiButton>
  </div>
  <span id="measurement-summary" class="measurement-readout-hint">点击地图添加起点</span>
</template>

<script setup>
import UiButton from "./base/UiButton.vue";

defineOptions({
  name: "MeasurementReadout"
});
</script>
