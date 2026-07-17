export function bindCityRelocationDrag(target, callbacks) {
  let drag = null;

  const finishDrag = event => {
    const current = drag;
    if (!current || current.pointerId !== event.pointerId) return null;
    drag = null;
    callbacks.onDragChange?.(null);
    callbacks.releasePointer?.(event.pointerId);
    return current;
  };

  const onPointerDown = event => {
    if (!callbacks.isActive?.() || !callbacks.isPrimaryPointerDown?.(event)) return;
    const cityId = callbacks.getCityId?.(event);
    if (!Number.isInteger(cityId) || cityId !== callbacks.getSelectedCityId?.()) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    drag = {pointerId: event.pointerId, cityId};
    callbacks.onDragChange?.({...drag});
    callbacks.capturePointer?.(event.pointerId);
    callbacks.onPreview?.(callbacks.inspect(cityId, callbacks.getTarget(event)));
  };

  const onPointerMove = event => {
    if (!drag || drag.pointerId !== event.pointerId || !callbacks.isActive?.()) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    callbacks.onPreview?.(callbacks.inspect(drag.cityId, callbacks.getTarget(event)));
  };

  const onPointerUp = event => {
    const current = finishDrag(event);
    if (!current) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    const targetCell = callbacks.getTarget(event);
    const preview = callbacks.inspect(current.cityId, targetCell);
    callbacks.onPreview?.(preview);
    if (!preview.valid || !preview.changed) {
      callbacks.onInvalid?.(preview);
      return;
    }
    callbacks.onCommit?.(current.cityId, targetCell, preview);
  };

  const onPointerCancel = event => {
    if (!finishDrag(event)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    callbacks.onCancel?.("pointercancel");
  };

  target.addEventListener("pointerdown", onPointerDown, true);
  target.addEventListener("pointermove", onPointerMove, true);
  target.addEventListener("pointerup", onPointerUp, true);
  target.addEventListener("pointercancel", onPointerCancel, true);
  return {
    cancel(reason = "cancel", notify = true) {
      if (!drag) return false;
      const pointerId = drag.pointerId;
      drag = null;
      callbacks.onDragChange?.(null);
      callbacks.releasePointer?.(pointerId);
      if (notify) callbacks.onCancel?.(reason);
      return true;
    },
    dispose() {
      target.removeEventListener("pointerdown", onPointerDown, true);
      target.removeEventListener("pointermove", onPointerMove, true);
      target.removeEventListener("pointerup", onPointerUp, true);
      target.removeEventListener("pointercancel", onPointerCancel, true);
      drag = null;
      callbacks.onDragChange?.(null);
    },
    getActiveDrag() {
      return drag ? {...drag} : null;
    }
  };
}
