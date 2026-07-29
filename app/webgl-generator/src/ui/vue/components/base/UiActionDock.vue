<template>
  <div ref="root" class="ui-action-dock">
    <div class="ui-action-icon-row" role="toolbar" aria-label="对象操作">
      <ElButton
        v-for="action in actions"
        :key="actionIdentity(action)"
        :data-action-id="actionIdentity(action)"
        class="ui-icon-action"
        :class="{active: isActionActive(action), 'is-editing': isActionActive(action)}"
        :disabled="action.disabled"
        :title="action.label"
        :aria-label="action.label"
        :aria-pressed="isActionActive(action) ? 'true' : 'false'"
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
        :data-placement-side="panelPlacement.side"
        :data-available-height="panelPlacement.available"
        :style="panelStyle"
        role="dialog"
        :aria-label="activeActionLabel"
      >
        <header ref="panelHeader" class="ui-secondary-action-header" :class="{dragging: dragState}" @pointerdown="startPanelDrag">
          <div class="ui-secondary-action-title"><span class="ui-state-token">编辑中</span><strong>{{ activeActionLabel }}</strong></div>
          <button type="button" class="ui-close-button ui-secondary-action-close" aria-label="关闭二级编辑面板" @pointerdown.stop @click="closePanel">×</button>
        </header>
        <div ref="panelBody" class="ui-secondary-action-body">
          <slot :name="active" />
        </div>
      </section>
    </Teleport>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useManagedOverlay} from "../../composables/use-managed-overlay.js";
import {beginDirectManipulationSession} from "../../../../runtime/direct-manipulation-session.js";
import {chooseSecondaryPanelPlacement, constrainUserSecondaryPanelPosition, findSecondaryActionAnchor} from "./secondary-panel-placement.js";

defineOptions({
  name: "UiActionDock"
});

const props = defineProps({
  hostId: {
    type: String,
    required: true
  },
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
const panelHeader = ref(null);
const panelBody = ref(null);
const panelStyle = ref({});
const panelPlacement = ref({side: "below", available: 0});
const dragState = ref(null);
const userPositioned = ref(false);
const activeAction = computed(() => props.actions.find(action => action.resultClass === "open-secondary" && action.key === props.active));
const activeActionLabel = computed(() => activeAction.value?.label || "对象操作");
const overlayId = computed(() => `ui-action-dock:${props.hostId}`);
let panelDragSession = null;
let positionObserver = null;
let positionFrame = 0;

useManagedOverlay(panel, () => Boolean(props.active), {
  id: overlayId.value,
  onClose: () => closePanel()
});

watch(() => props.active, active => {
  if (active) {
    userPositioned.value = false;
    removePositionListeners();
    disconnectPositionObserver();
    nextTick(() => {
      bindPositionObserver();
      schedulePanelPositionUpdate();
      addPositionListeners();
    });
    return;
  }
  panelDragSession?.cancel("panel-close");
  removePositionListeners();
  disconnectPositionObserver();
  cancelScheduledPanelPosition();
});

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  panelDragSession?.cancel("unmount");
  removePositionListeners();
  disconnectPositionObserver();
  cancelScheduledPanelPosition();
});

function toggleAction(action) {
  if (action.disabled) return;
  if (action.resultClass !== "open-secondary") {
    emit("select", action.key);
    return;
  }
  const next = action.key === props.active ? null : action.key;
  emit("update:active", next);
  emit("select", next);
}

function actionIdentity(action) {
  return `${props.hostId}:${action.key}`;
}

function isActionActive(action) {
  return Boolean(action.active || action.resultClass === "open-secondary" && action.key === props.active);
}

function closePanel() {
  panelDragSession?.cancel("panel-close");
  userPositioned.value = false;
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
  view.addEventListener("resize", schedulePanelPositionUpdate);
  view.addEventListener("scroll", schedulePanelPositionUpdate, true);
}

function removePositionListeners() {
  const view = root.value?.ownerDocument?.defaultView || window;
  view.removeEventListener("resize", schedulePanelPositionUpdate);
  view.removeEventListener("scroll", schedulePanelPositionUpdate, true);
}

function bindPositionObserver() {
  disconnectPositionObserver();
  const view = root.value?.ownerDocument?.defaultView || window;
  const ResizeObserverCtor = view.ResizeObserver;
  if (!ResizeObserverCtor || !panel.value) return;
  positionObserver = new ResizeObserverCtor(schedulePanelPositionUpdate);
  positionObserver.observe(panel.value);
  if (panelBody.value) positionObserver.observe(panelBody.value);
}

function disconnectPositionObserver() {
  positionObserver?.disconnect();
  positionObserver = null;
}

function schedulePanelPositionUpdate() {
  const view = root.value?.ownerDocument?.defaultView || window;
  if (positionFrame || !props.active) return;
  positionFrame = view.requestAnimationFrame(() => {
    positionFrame = 0;
    updatePanelPosition();
  });
}

function cancelScheduledPanelPosition() {
  if (!positionFrame) return;
  const view = root.value?.ownerDocument?.defaultView || window;
  view.cancelAnimationFrame(positionFrame);
  positionFrame = 0;
}

function startPanelDrag(event) {
  if (event.button !== 0 || !panel.value) return;
  event.preventDefault();
  const rect = panel.value.getBoundingClientRect();
  panelDragSession?.cancel("restart");
  const captureTarget = event.currentTarget;
  const positionBefore = {...panelStyle.value};
  const userPositionedBefore = userPositioned.value;
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    width: rect.width
  };
  userPositioned.value = true;
  captureTarget?.setPointerCapture?.(event.pointerId);
  panelDragSession = beginDirectManipulationSession({
    kind: "ui-action-dock",
    pointerId: event.pointerId,
    captureTarget,
    scopeElement: root.value?.closest(".floating-panel") || null,
    onRollback: () => {
      panelStyle.value = positionBefore;
      userPositioned.value = userPositionedBefore;
    },
    onCleanup: () => {
      dragState.value = null;
      removeDragListeners();
      captureTarget?.removeEventListener?.("lostpointercapture", stopPanelDrag);
      panelDragSession = null;
    }
  });
  addDragListeners();
  captureTarget?.addEventListener?.("lostpointercapture", stopPanelDrag);
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
  const viewportWidth = view.innerWidth || 1024;
  const viewportHeight = view.innerHeight || 768;
  const safeTop = effectiveSafeTop();
  const headerHeight = panel.value?.querySelector?.(".ui-secondary-action-header")?.offsetHeight || 34;
  const width = Math.min(state.width, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, state.left + event.clientX - state.startX), Math.max(margin, viewportWidth - width - margin));
  const top = Math.min(Math.max(safeTop, state.top + event.clientY - state.startY), Math.max(safeTop, viewportHeight - headerHeight - margin));
  applyPanelPosition({left, top, width, maxHeight: Math.max(0, viewportHeight - margin - top), side: "user"});
}

function stopPanelDrag(event) {
  if (!panelDragSession) return;
  if (event?.pointerId !== undefined && event.pointerId !== panelDragSession.pointerId) return;
  panelDragSession.finish(event?.type === "pointerup" ? "pointerup" : event?.type || "cancel", event);
}

function updatePanelPosition() {
  const anchorId = activeAction.value ? actionIdentity(activeAction.value) : "";
  const anchor = findSecondaryActionAnchor(root.value, anchorId);
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
  const safeTop = effectiveSafeTop();
  const width = Math.min(Number(activeAction.value?.panelWidth) || 340, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
  const panelHeight = naturalPanelHeight();
  const placement = chooseSecondaryPanelPlacement({anchorRect: rect, panelHeight, viewportHeight, safeTop, bottomMargin: 8, gap: 8});
  applyPanelPosition({left, top: placement.top, width, maxHeight: placement.available, side: placement.side});
}

function naturalPanelHeight() {
  return Math.max(
    panel.value?.scrollHeight || Number(activeAction.value?.panelHeight) || 0,
    (panelHeader.value?.offsetHeight || 0) + (panelBody.value?.scrollHeight || 0)
  );
}

function constrainUserPanelPosition() {
  const current = panel.value?.getBoundingClientRect();
  const view = root.value?.ownerDocument?.defaultView || window;
  if (!current || !view) return;
  applyPanelPosition(constrainUserSecondaryPanelPosition({
    rect: current,
    viewportWidth: view.innerWidth || 1024,
    viewportHeight: view.innerHeight || 768,
    safeTop: effectiveSafeTop(),
    headerHeight: panelHeader.value?.offsetHeight || 34
  }));
}

function applyPanelPosition({left, top, width, maxHeight, side}) {
  panelPlacement.value = {side, available: Math.max(0, maxHeight)};
  panelStyle.value = {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, maxHeight)}px`
  };
}

function effectiveSafeTop() {
  const inherited = Number(root.value?.closest?.(".floating-panel")?.dataset?.launchSafeTop);
  return Number.isFinite(inherited) ? Math.max(8, inherited) : 8;
}
</script>
