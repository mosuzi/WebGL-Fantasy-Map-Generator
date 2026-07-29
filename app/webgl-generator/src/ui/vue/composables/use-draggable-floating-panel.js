import {computed, onBeforeUnmount, ref} from "vue";
import {beginDirectManipulationSession} from "../../../runtime/direct-manipulation-session.js";

export function useDraggableFloatingPanel(panelRef, options = {}) {
  const margin = Number(options.margin ?? 8);
  const position = ref(readStoredPosition(options.storageKey));
  const panelWidth = ref(position.value?.width || null);
  const dragging = ref(false);
  let dragState = null;
  let dragSession = null;

  const panelStyle = computed(() => {
    const style = {};
    if (position.value) {
      style.left = `${Math.round(position.value.x)}px`;
      style.top = `${Math.round(position.value.y)}px`;
    }
    if (panelWidth.value) style.width = `${Math.round(panelWidth.value)}px`;
    return style;
  });

  function positionNear(anchor, placement = {}) {
    const rect = anchor?.getBoundingClientRect?.();
    if (!rect || typeof window === "undefined") return;
    const width = Number(placement.width ?? panelWidth.value ?? options.defaultWidth ?? 320);
    const topOffset = Number(placement.topOffset ?? 8);
    panelWidth.value = clamp(width, Number(placement.minWidth ?? 220), Math.max(220, window.innerWidth - margin * 2));
    const left = clamp(rect.left, margin, window.innerWidth - panelWidth.value - margin);
    const top = clamp(rect.bottom + topOffset, margin, window.innerHeight - Number(placement.estimatedHeight ?? options.defaultHeight ?? 260) - margin);
    setPanelPosition({x: left, y: top}, {save: false});
  }

  function setPanelPosition(nextPosition, {save = true} = {}) {
    if (!nextPosition || typeof window === "undefined") return;
    const {width, height} = panelBounds();
    position.value = {
      x: clamp(Number(nextPosition.x) || margin, margin, window.innerWidth - width - margin),
      y: clamp(Number(nextPosition.y) || margin, margin, window.innerHeight - height - margin)
    };
    if (save) saveStoredPosition(options.storageKey, position.value, panelWidth.value || width);
  }

  function constrainPanel({save = false} = {}) {
    if (!position.value) return;
    setPanelPosition(position.value, {save});
  }

  function startDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target?.closest?.("button, a, input, select, textarea, [data-no-drag]")) return;
    const rect = panelRef.value?.getBoundingClientRect?.();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    dragSession?.cancel("restart");
    const positionBefore = position.value ? {...position.value} : null;
    const widthBefore = panelWidth.value;
    const captureTarget = event.currentTarget;
    panelWidth.value = Math.round(rect.width || panelWidth.value || options.defaultWidth || 320);
    position.value = {x: rect.left, y: rect.top};
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    dragging.value = true;
    captureTarget?.setPointerCapture?.(event.pointerId);
    dragSession = beginDirectManipulationSession({
      kind: "vue-floating-panel",
      pointerId: event.pointerId,
      captureTarget,
      onCommit: () => constrainPanel({save: true}),
      onRollback: () => {
        position.value = positionBefore;
        panelWidth.value = widthBefore;
      },
      onCleanup: () => {
        dragState = null;
        dragging.value = false;
        window.removeEventListener("pointermove", dragPanel);
        window.removeEventListener("pointerup", stopDrag);
        window.removeEventListener("pointercancel", stopDrag);
        captureTarget?.removeEventListener?.("lostpointercapture", stopDrag);
        dragSession = null;
      }
    });
    window.addEventListener("pointermove", dragPanel);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    captureTarget?.addEventListener?.("lostpointercapture", stopDrag);
  }

  function dragPanel(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    setPanelPosition({
      x: event.clientX - dragState.offsetX,
      y: event.clientY - dragState.offsetY
    }, {save: false});
  }

  function stopDrag(event) {
    if (!dragState || !dragSession) return;
    if (event?.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;
    dragSession.finish(event?.type === "pointerup" ? "pointerup" : event?.type || "cancel", event);
  }

  function panelBounds() {
    const rect = panelRef.value?.getBoundingClientRect?.();
    return {
      width: rect?.width || panelRef.value?.offsetWidth || panelWidth.value || Number(options.defaultWidth || 320),
      height: rect?.height || panelRef.value?.offsetHeight || Number(options.defaultHeight || 220)
    };
  }

  onBeforeUnmount(() => {
    dragSession?.cancel("unmount");
  });

  return {
    dragging,
    panelStyle,
    position,
    positionNear,
    setPanelPosition,
    constrainPanel,
    startDrag,
    stopDrag
  };
}

function readStoredPosition(storageKey) {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return {
      x: parsed.x,
      y: parsed.y,
      width: Number.isFinite(parsed.width) ? parsed.width : undefined
    };
  } catch {
    return null;
  }
}

function saveStoredPosition(storageKey, position, width) {
  if (!storageKey || typeof window === "undefined" || !position) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(width || 0)
    }));
  } catch {
    // localStorage may be unavailable in restricted browser modes.
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(Math.max(min, max), value));
}
