<template>
  <div ref="root" class="ui-action-dock">
    <div class="ui-action-icon-row" role="toolbar" aria-label="对象操作">
      <ElButton
        v-for="action in actions"
        :key="action.key"
        class="ui-icon-action"
        :class="{active: action.key === active || action.active, 'is-editing': action.key === active}"
        :disabled="action.disabled"
        :title="action.label"
        :aria-label="action.label"
        :aria-pressed="action.key === active ? 'true' : 'false'"
        circle
        @click="toggleAction(action)"
      >
        <span aria-hidden="true">{{ action.icon }}</span>
      </ElButton>
    </div>

    <Teleport to="body">
      <section
        v-if="active"
        ref="panel"
        class="ui-secondary-action-panel is-editing"
        data-ui-state="editing"
        :style="panelStyle"
        role="dialog"
        :aria-label="activeActionLabel"
      >
        <header class="ui-secondary-action-header" :class="{dragging: dragState}" @pointerdown="startPanelDrag">
          <div class="ui-secondary-action-title"><span class="ui-state-token">编辑中</span><strong>{{ activeActionLabel }}</strong></div>
          <button type="button" class="ui-close-button ui-secondary-action-close" aria-label="关闭二级编辑面板" @pointerdown.stop @click="closePanel">×</button>
        </header>
        <div class="ui-secondary-action-body">
          <slot :name="active" />
        </div>
      </section>
    </Teleport>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch} from "vue";
import {useManagedOverlay} from "../../composables/use-managed-overlay.js";

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
const dragState = ref(null);
const userPositioned = ref(false);
const activeAction = computed(() => props.actions.find(action => action.key === props.active));
const activeActionLabel = computed(() => activeAction.value?.label || "对象操作");
const overlayId = `ui-action-dock:${useId()}`;

useManagedOverlay(panel, () => Boolean(props.active), {
  id: overlayId,
  onClose: () => closePanel()
});

watch(() => props.active, active => {
  if (active) {
    userPositioned.value = false;
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
  removeDragListeners();
});

function toggleAction(action) {
  if (action.disabled) return;
  if (action.panel === false) {
    emit("select", action.key);
    return;
  }
  const next = action.key === props.active ? null : action.key;
  emit("update:active", next);
  emit("select", next);
}

function closePanel() {
  dragState.value = null;
  userPositioned.value = false;
  removeDragListeners();
  emit("update:active", null);
  emit("select", null);
}

function onDocumentPointerDown(event) {
  if (!props.active) return;
  if (root.value?.contains(event.target) || panel.value?.contains(event.target)) return;
  if (isElementPlusOverlayTarget(event.target)) return;
  closePanel();
}

function isElementPlusOverlayTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(".el-popper, .el-picker__popper, .el-color-dropdown, .el-select-dropdown"));
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

function startPanelDrag(event) {
  if (event.button !== 0 || !panel.value) return;
  event.preventDefault();
  const rect = panel.value.getBoundingClientRect();
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    width: rect.width
  };
  userPositioned.value = true;
  addDragListeners();
}

function addDragListeners() {
  const view = root.value?.ownerDocument?.defaultView || window;
  view.addEventListener("pointermove", onPanelDragMove);
  view.addEventListener("pointerup", stopPanelDrag);
  view.addEventListener("pointercancel", stopPanelDrag);
}

function removeDragListeners() {
  const view = root.value?.ownerDocument?.defaultView || window;
  view.removeEventListener("pointermove", onPanelDragMove);
  view.removeEventListener("pointerup", stopPanelDrag);
  view.removeEventListener("pointercancel", stopPanelDrag);
}

function onPanelDragMove(event) {
  const state = dragState.value;
  if (!state) return;
  const view = root.value?.ownerDocument?.defaultView || window;
  const margin = 10;
  const minHeight = 180;
  const viewportWidth = view.innerWidth || 1024;
  const viewportHeight = view.innerHeight || 768;
  const width = Math.min(state.width, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, state.left + event.clientX - state.startX), Math.max(margin, viewportWidth - width - margin));
  const top = Math.min(Math.max(margin, state.top + event.clientY - state.startY), Math.max(margin, viewportHeight - minHeight - margin));
  applyPanelPosition({left, top, width});
}

function stopPanelDrag() {
  dragState.value = null;
  removeDragListeners();
}

function updatePanelPosition() {
  const anchor = root.value?.querySelector(".ui-icon-action.active") || root.value;
  const view = root.value?.ownerDocument?.defaultView || window;
  if (!anchor || !view) return;

  if (userPositioned.value) {
    constrainUserPanelPosition();
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const margin = 10;
  const viewportWidth = view.innerWidth || 1024;
  const viewportHeight = view.innerHeight || 768;
  const width = Math.min(Number(activeAction.value?.panelWidth) || 340, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
  const below = viewportHeight - rect.bottom - margin;
  const minHeight = 180;
  const estimatedHeight = Math.min(Number(activeAction.value?.panelHeight) || minHeight, viewportHeight - margin * 2);
  const rawTop = below > estimatedHeight ? rect.bottom + 8 : Math.max(margin, rect.top - estimatedHeight - 8);
  const maxTop = Math.max(margin, viewportHeight - minHeight - margin);
  const top = Math.min(Math.max(margin, rawTop), maxTop);

  applyPanelPosition({left, top, width});
}

function constrainUserPanelPosition() {
  const current = panel.value?.getBoundingClientRect();
  const view = root.value?.ownerDocument?.defaultView || window;
  if (!current || !view) return;
  const margin = 10;
  const viewportWidth = view.innerWidth || 1024;
  const viewportHeight = view.innerHeight || 768;
  const minHeight = 180;
  const width = Math.min(current.width, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, current.left), Math.max(margin, viewportWidth - width - margin));
  const top = Math.min(Math.max(margin, current.top), Math.max(margin, viewportHeight - minHeight - margin));
  applyPanelPosition({left, top, width});
}

function applyPanelPosition({left, top, width}) {
  const view = root.value?.ownerDocument?.defaultView || window;
  const viewportHeight = view.innerHeight || 768;
  const margin = 10;
  const minHeight = 180;
  panelStyle.value = {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(minHeight, viewportHeight - top - margin)}px`
  };
}
</script>
