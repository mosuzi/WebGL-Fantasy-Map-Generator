<template>
  <div class="cloud-storage-panel" :aria-busy="state.busy ? 'true' : 'false'">
    <div class="cloud-storage-notice">
      <strong>把完整地图存档放进自己的云盘</strong>
      <span>授权只保留在当前页面内存中；关闭或刷新页面后需要重新连接。</span>
    </div>

    <div class="cloud-storage-provider-tabs" role="tablist" aria-label="云存储服务">
      <UiButton
        v-for="provider in state.providers"
        :key="provider.id"
        :active="provider.id === state.selectedProviderId"
        variant="secondary"
        :disabled="state.busy"
        role="tab"
        :aria-selected="provider.id === state.selectedProviderId ? 'true' : 'false'"
        @click="callbacks.onSelectProvider(provider.id)"
      >
        {{ provider.label }}
      </UiButton>
    </div>

    <template v-if="selectedProvider">
      <div v-if="!selectedProvider.configured" class="cloud-storage-configuration" data-cloud-state="unconfigured">
        <strong>{{ selectedProvider.label }} 尚未配置</strong>
        <p>部署者需要先在 Cloud Provider Config 中设置以下公开的 OAuth client identifier。本仓库不会提供项目方账号，也不会回退到原作的硬编码配置。</p>
        <p v-if="selectedProvider.configurationError">{{ selectedProvider.configurationError }}</p>
        <code v-for="field in missingConfiguration" :key="field">{{ field }}</code>
        <a href="https://github.com/mosuzi/fmg-gl/blob/main/docs/deployment/cloud-storage.md" target="_blank" rel="noreferrer">查看自部署配置说明</a>
      </div>

      <template v-else>
        <div class="cloud-storage-connection" :data-cloud-state="selectedProvider.connected ? 'connected' : 'disconnected'">
          <span>{{ selectedProvider.connected ? "已连接；令牌仅存在内存中" : "尚未连接账号" }}</span>
          <UiButton v-if="selectedProvider.connected" variant="secondary" :disabled="state.busy" @click="callbacks.onDisconnect">断开连接</UiButton>
          <UiButton v-else :disabled="state.busy" @click="callbacks.onConnect">连接 {{ selectedProvider.label }}</UiButton>
        </div>

        <template v-if="selectedProvider.connected">
          <div class="cloud-storage-actions">
            <UiButton :disabled="state.busy" @click="callbacks.onCreate">新建云端存档</UiButton>
            <UiButton variant="secondary" :disabled="state.busy" @click="callbacks.onRefresh">刷新列表</UiButton>
          </div>

          <div class="cloud-storage-file-list" aria-label="云端地图文件">
            <button
              v-for="file in state.files"
              :key="file.id"
              type="button"
              :class="['cloud-storage-file', {selected: file.id === state.selectedFileId}]"
              :aria-pressed="file.id === state.selectedFileId ? 'true' : 'false'"
              @click="callbacks.onSelectFile(file.id)"
            >
              <strong>{{ file.name }}</strong>
              <span>{{ formatFileMeta(file) }}</span>
            </button>
            <p v-if="!state.files.length" class="cloud-storage-empty">还没有可选地图。连接后刷新列表，或先新建一份云端存档。</p>
          </div>

          <div class="cloud-storage-selected-actions">
            <UiButton variant="secondary" :disabled="state.busy || !state.selectedFileId" @click="callbacks.onOverwrite">覆盖所选文件</UiButton>
            <UiButton :disabled="state.busy || !state.selectedFileId" @click="callbacks.onLoad">载入所选地图</UiButton>
          </div>
        </template>
      </template>
    </template>

    <p v-if="state.status" class="cloud-storage-status" aria-live="polite">{{ state.status }}</p>
    <p v-if="state.error" class="cloud-storage-error" role="alert">{{ state.error }}</p>
    <p class="cloud-storage-live-boundary">当前版本已通过本地 fixture 与 mock 协议回归；在项目方提供 OAuth client 和测试账号前，不代表 Dropbox / Google Drive 真实账号联调完成。</p>
  </div>
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./base/UiButton.vue";

const props = defineProps({
  state: {type: Object, required: true},
  callbacks: {type: Object, required: true}
});

const selectedProvider = computed(() => props.state.providers.find(provider => provider.id === props.state.selectedProviderId) || props.state.providers[0] || null);
const missingConfiguration = computed(() => {
  if (selectedProvider.value?.id === "dropbox") {
    return [
      !selectedProvider.value.configuration.appKey && "providers.dropbox.appKey",
      !selectedProvider.value.configuration.redirectUri && "providers.dropbox.redirectUri"
    ].filter(Boolean);
  }
  return [!selectedProvider.value?.configuration.clientId && "providers.googleDrive.clientId"].filter(Boolean);
});

function formatFileMeta(file) {
  const size = formatBytes(file.size);
  const modified = file.modifiedAt ? new Date(file.modifiedAt).toLocaleString("zh-CN") : "时间未知";
  return `${size} · ${modified}`;
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}
</script>
