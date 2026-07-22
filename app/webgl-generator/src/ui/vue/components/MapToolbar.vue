<template>
  <div class="map-toolbar-surface" :class="{'is-collapsed': collapsed}" :data-toolbar-collapsed="collapsed">
    <div id="map-global-tool-actions" v-show="!collapsed" class="map-toolbar-actions">
      <UiButton id="open-generation-panel" variant="primary">控制面板</UiButton>
      <UiButton id="fit-view" variant="secondary">适配视图</UiButton>
      <UiButton id="toggle-measurement" variant="secondary" aria-pressed="false">测量</UiButton>
      <UiButton id="open-development-panel" class="debug-action" variant="secondary" hidden>开发模式</UiButton>
      <UiButton
        id="collapse-global-tools"
        class="map-toolbar-collapse"
        variant="secondary"
        aria-label="收起全局工具"
        aria-controls="map-global-tool-actions"
        :aria-expanded="!collapsed"
        title="收起全局工具"
        @click="setCollapsed(true)"
      >
        <svg
          class="map-toolbar-chevron map-toolbar-chevron-collapse"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
      </UiButton>
    </div>
    <button
      id="expand-global-tools"
      v-show="collapsed"
      class="map-toolbar-edge-trigger"
      type="button"
      aria-label="展开全局工具"
      aria-controls="map-global-tool-actions"
      :aria-expanded="!collapsed"
      title="展开全局工具"
      @click="setCollapsed(false)"
    >
      <svg
        class="map-toolbar-chevron map-toolbar-chevron-expand"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./base/UiButton.vue";
import {useGlobalConfigStore} from "../stores/global-config-store.js";

defineOptions({
  name: "MapToolbar"
});

const config = useGlobalConfigStore();
const collapsed = computed(() => Boolean(config.preferences.toolbarCollapsed));

function setCollapsed(value) {
  config.patchPreferences({toolbarCollapsed: Boolean(value)});
}
</script>
