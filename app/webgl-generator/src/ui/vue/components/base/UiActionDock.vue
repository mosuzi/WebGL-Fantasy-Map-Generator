<template>
  <div ref="root" class="ui-action-dock">
    <div class="ui-action-icon-row" role="toolbar" aria-label="对象操作">
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        class="ui-icon-action"
        :class="{active: action.key === active}"
        :disabled="action.disabled"
        :title="action.label"
        :aria-label="action.label"
        @click="toggleAction(action)"
      >
        <span aria-hidden="true">{{ action.icon }}</span>
      </button>
    </div>

    <Teleport to="body">
      <section
        v-if="active"
        ref="panel"
        class="ui-secondary-action-panel"
        :style="panelStyle"
        role="dialog"
        :aria-label="activeActionLabel"
      >
        <header class="ui-secondary-action-header">
          <strong>{{ activeActionLabel }}</strong>
          <button type="button" class="ui-secondary-action-close" aria-label="关闭二级编辑面板" @click="closePanel">×</button>
        </header>
        <div class="ui-secondary-action-body">
          <slot :name="active" />
        </div>
      </section>
    </Teleport>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";

defineOptions({
  name: "UiActionDock"
});

const props = defineProps({
  actions: {
    type: Array,
    required: true
  },
  active: {
    type: [String, null],
    default: null
  }
});

const emit = defineEmits(["update:active", "select"]);
const root = ref(null);
const panel = ref(null);
const panelStyle = ref({});
const activeAction = computed(() => props.actions.find(action => action.key === props.active));
const activeActionLabel = computed(() => activeAction.value?.label || "对象操作");

watch(() => props.active, active => {
  if (active) {
    removePositionListeners();
    nextTick(() => {
      updatePanelPosition();
      addPositionListeners();
    });
    return;
  }
  removePositionListeners();
});

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  removePositionListeners();
});

function toggleAction(action) {
  if (action.disabled) return;
  const next = action.key === props.active ? null : action.key;
  emit("update:active", next);
  emit("select", next);
}

function closePanel() {
  emit("update:active", null);
  emit("select", null);
}

function onDocumentPointerDown(event) {
  if (!props.active) return;
  if (root.value?.contains(event.target) || panel.value?.contains(event.target)) return;
  closePanel();
}

function addPositionListeners() {
  const view = root.value?.ownerDocument?.defaultView || window;
  view.addEventListener("resize", updatePanelPosition);
  view.addEventListener("scroll", updatePanelPosition, true);
}

function removePositionListeners() {
  const view = root.value?.ownerDocument?.defaultView || window;
  view.removeEventListener("resize", updatePanelPosition);
  view.removeEventListener("scroll", updatePanelPosition, true);
}

function updatePanelPosition() {
  const anchor = root.value?.querySelector(".ui-icon-action.active") || root.value;
  const view = root.value?.ownerDocument?.defaultView || window;
  if (!anchor || !view) return;

  const rect = anchor.getBoundingClientRect();
  const margin = 10;
  const viewportWidth = view.innerWidth || 1024;
  const viewportHeight = view.innerHeight || 768;
  const width = Math.min(340, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
  const below = viewportHeight - rect.bottom - margin;
  const top = below > 180 ? rect.bottom + 8 : Math.max(margin, rect.top - 220);

  panelStyle.value = {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(180, viewportHeight - top - margin)}px`
  };
}
</script>
