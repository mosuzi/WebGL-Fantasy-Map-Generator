<template>
  <details class="map-recovery-controls">
    <summary>意外恢复</summary>
    <label><input type="checkbox" :checked="state.enabled" :disabled="state.busy" @change="send('enabled', {value: $event.target.checked})" /> 自动保留恢复点</label>
    <div class="project-file-actions">
      <UiButton :disabled="state.busy" @click="send('save')">保留恢复点</UiButton>
      <UiButton :disabled="state.busy" @click="send('refresh')">刷新列表</UiButton>
    </div>
    <label>选择恢复点
      <select v-model="selected" :disabled="state.busy" aria-label="选择恢复点">
        <option value="">请选择</option>
        <option v-for="point in state.records" :key="point.id" :value="point.id" :disabled="!point.valid">
          {{ point.name }} · {{ new Date(point.createdAt).toLocaleString() }} · {{ (point.bytes / 1048576).toFixed(1) }} MB{{ point.valid ? '' : ' · 记录不可用' }}
        </option>
      </select>
    </label>
    <UiButton :disabled="state.busy || !selected" @click="send('restore', {id: selected})">恢复所选地图</UiButton>
    <p role="status">{{ state.busy ? '正在处理恢复点…' : state.message }}</p>
  </details>
</template>

<script setup>
import {onBeforeUnmount, onMounted, reactive, ref} from "vue";
import UiButton from "./base/UiButton.vue";
import {RECOVERY_COMMAND, RECOVERY_STATUS} from "../../../runtime/map-recovery.js";
const state = reactive({enabled: false, busy: false, records: [], message: ""});
const selected = ref("");
const receive = event => {
  Object.assign(state, event.detail);
  if (!state.records.some(point => point.id === selected.value && point.valid)) selected.value = "";
};
const send = (action, options = {}) => document.dispatchEvent(new CustomEvent(RECOVERY_COMMAND, {detail: {action, ...options}}));
onMounted(() => { document.addEventListener(RECOVERY_STATUS, receive); send("refresh"); });
onBeforeUnmount(() => document.removeEventListener(RECOVERY_STATUS, receive));
</script>

<style scoped>
.map-recovery-controls { margin-block: 10px; }
.map-recovery-controls > * { margin-block: 6px; }
select { display: block; width: 100%; min-width: 0; }
</style>
