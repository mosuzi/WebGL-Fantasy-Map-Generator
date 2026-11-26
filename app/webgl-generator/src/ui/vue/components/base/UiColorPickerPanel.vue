<template>
  <div ref="host" class="ui-picker-panel" @mousedown.prevent="startDrag" @touchstart.passive="startDrag"
    @keydown="onKeydown" @click="onClick">
    <ElConfigProvider :locale="zhCn">
      <ElColorPickerPanel ref="panel" :model-value="color" color-format="hex" :border="false" :validate-event="false"
        @update:model-value="preview" />
    </ElConfigProvider>
  </div>
</template>

<script setup>
import {nextTick, onBeforeUnmount, onMounted, ref} from "vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";

const props = defineProps({color: {type: String, required: true}});
const emit = defineEmits(["preview", "apply"]);
const host = ref(null), panel = ref(null);
let drag = null, observer;

function preview(color) {
  if (drag) emit("preview", color);
}

function stopDrag() {
  drag?.events.abort();
  drag = null;
}

function cancelDrag() {
  if (!drag) return;
  const original = drag.original;
  stopDrag();
  emit("preview", original);
}

function applySelection() {
  if (panel.value) emit("apply", panel.value.color.value);
}

function startDrag(event) {
  if (drag || (event.type === "mousedown" && event.button !== 0)) return;
  const events = new AbortController();
  drag = {original: props.color, events};
  const options = {signal: events.signal};
  // Element Plus 在 document 的结束事件中读取最后一个坐标。
  window.addEventListener(event.type === "mousedown" ? "mouseup" : "touchend", () => {
    stopDrag();
    applySelection();
  }, options);
  window.addEventListener("blur", cancelDrag, options);
  window.addEventListener("touchcancel", cancelDrag, options);
}

function onKeydown(event) {
  if (event.defaultPrevented) nextTick(applySelection);
}

function onClick(event) {
  if (event.detail === 0) nextTick(applySelection);
}

onMounted(() => {
  observer = new ResizeObserver(() => panel.value?.update());
  observer.observe(host.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  stopDrag();
});
</script>

<style scoped>
.ui-picker-panel { min-width: 0; touch-action: none; }
.ui-picker-panel :deep(.el-color-picker-panel) {
  width: 100%;
  padding: 0;
  background: transparent;
}
.ui-picker-panel :deep(.el-color-picker-panel__wrapper) {
  display: flex;
  flex-direction: row-reverse;
  gap: 8px;
  margin: 0;
}
.ui-picker-panel :deep(.el-color-svpanel) {
  flex: 1;
  min-width: 0;
  cursor: crosshair;
}
/* 下方共用 HEX 字段保留短码、失焦提交及非法输入恢复。 */
.ui-picker-panel :deep(.el-color-picker-panel__footer) { display: none; }
</style>
