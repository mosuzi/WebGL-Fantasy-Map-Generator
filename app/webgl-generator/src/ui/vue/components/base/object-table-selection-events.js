export function createObjectTableSelectionEventState() {
  return {modifiers: null};
}

export function captureObjectTableSelectionEvent(state, event, {stopPropagation = false, preserveExisting = false} = {}) {
  if (stopPropagation) event?.stopPropagation?.();
  if (preserveExisting && state.modifiers) return;
  state.modifiers = {shiftKey: Boolean(event?.shiftKey)};
}

export function captureObjectTableSelectionHitClick(state, event, scheduleCleanup = queueMicrotask) {
  event?.stopPropagation?.();
  if (event?.target !== event?.currentTarget) return false;
  captureObjectTableSelectionEvent(state, event);
  const captured = state.modifiers;
  scheduleCleanup(() => {
    if (state.modifiers === captured) state.modifiers = null;
  });
  return true;
}

export function consumeObjectTableSelectionModifiers(state) {
  const modifiers = state.modifiers;
  state.modifiers = null;
  return modifiers;
}

export function stopObjectTableSelectionEvent(event) {
  event?.stopPropagation?.();
}
