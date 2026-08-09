export function bindCityRelocationDrag(target, callbacks) {
  let drag = null;
  let pending = null;
  let sequence = 0;
  const requestFrame = callbacks.requestFrame || globalThis.requestAnimationFrame || (callback => setTimeout(() => callback(now()), 0));
  const cancelFrame = callbacks.cancelFrame || globalThis.cancelAnimationFrame || clearTimeout;

  const clearFrame = current => {
    if (!current?.frameId) return;
    cancelFrame(current.frameId);
    current.frameId = 0;
  };

  const release = current => {
    if (!current) return;
    clearFrame(current);
    try {
      callbacks.onDragChange?.(null);
    } catch (error) {
      callbacks.onError?.(error, {phase: "clear-drag", generation: current.generation});
    }
    try {
      callbacks.releasePointer?.(current.pointerId);
    } catch (error) {
      callbacks.onError?.(error, {phase: "release-pointer", generation: current.generation});
    }
  };

  const abortPending = reason => {
    if (!pending) return false;
    const current = pending;
    pending = null;
    current.controller?.abort?.(reason);
    callbacks.onPendingChange?.(null);
    return true;
  };

  const cancelActive = (reason, notify) => {
    sequence++;
    const current = drag;
    drag = null;
    release(current);
    const aborted = abortPending(reason);
    callbacks.onPreview?.(null);
    if (notify && (current || aborted)) callbacks.onCancel?.(reason);
    return Boolean(current || aborted);
  };

  const flushPreview = (generation, frameTime = now()) => {
    const current = drag;
    if (!current || current.generation !== generation) return;
    current.frameId = 0;
    if (current.lastPreviewAt && frameTime - current.lastPreviewAt < 16) {
      schedulePreview(current);
      return;
    }
    current.lastPreviewAt = frameTime;
    const startedAt = now();
    try {
      const targetValue = callbacks.getTarget(current.lastEvent);
      const targetAt = now();
      const preview = (callbacks.inspectFast || callbacks.inspect)(current.cityId, targetValue);
      const inspectAt = now();
      current.preview = preview;
      callbacks.onPreview?.(preview);
      const completedAt = now();
      callbacks.onPerformance?.({
        phase: "preview",
        generation,
        startTime: startedAt,
        targetMs: targetAt - startedAt,
        inspectMs: inspectAt - targetAt,
        renderMs: completedAt - inspectAt,
        totalMs: completedAt - startedAt
      });
    } catch (error) {
      cancelActive("preview-error", false);
      callbacks.onError?.(error, {phase: "preview", generation});
    }
  };

  const schedulePreview = current => {
    if (current.frameId) return;
    current.frameId = requestFrame(frameTime => flushPreview(current.generation, Number.isFinite(frameTime) ? frameTime : now()));
  };

  const onPointerDown = event => {
    if (!callbacks.isActive?.() || !callbacks.isPrimaryPointerDown?.(event)) return;
    const cityId = callbacks.getCityId?.(event);
    const selectedCityId = callbacks.getSelectedCityId?.();
    if (!Number.isInteger(cityId) || cityId !== selectedCityId) {
      callbacks.onPointerMiss?.({cityId: Number.isInteger(cityId) ? cityId : null, selectedCityId});
      return;
    }
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    abortPending("new-drag");
    const generation = ++sequence;
    drag = {pointerId: event.pointerId, cityId, generation, lastEvent: pointerSnapshot(event), preview: null, frameId: 0, lastPreviewAt: 0};
    try {
      callbacks.onDragChange?.(publicDrag(drag));
      callbacks.capturePointer?.(event.pointerId);
      schedulePreview(drag);
    } catch (error) {
      cancelActive("pointerdown-error", false);
      callbacks.onError?.(error, {phase: "pointerdown", generation});
    }
  };

  const onPointerMove = event => {
    if (!drag || drag.pointerId !== event.pointerId || !callbacks.isActive?.()) return;
    const startedAt = now();
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    drag.lastEvent = pointerSnapshot(event);
    schedulePreview(drag);
    callbacks.onPerformance?.({phase: "pointermove-handler", generation: drag.generation, startTime: startedAt, totalMs: now() - startedAt});
  };

  const onPointerUp = event => {
    const pointerUpStartedAt = now();
    const current = drag;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    drag = null;
    clearFrame(current);
    release(current);
    let targetValue;
    let preview;
    let previewReady = false;
    try {
      targetValue = callbacks.getTarget(pointerSnapshot(event));
      preview = (callbacks.inspectFast || callbacks.inspect)(current.cityId, targetValue);
      previewReady = true;
      callbacks.onPreview?.(preview);
    } catch (error) {
      callbacks.onError?.(error, {phase: "pointerup-target", generation: current.generation});
      callbacks.onCancel?.("pointerup-error");
      return;
    } finally {
      if (!previewReady) callbacks.onPreview?.(null);
    }
    if (!preview.valid || !preview.changed) {
      callbacks.onInvalid?.(preview);
      return;
    }
    if (!callbacks.preflight) {
      try {
        const commitStartedAt = now();
        callbacks.onCommit?.(current.cityId, targetValue, preview);
        callbacks.onPerformance?.({phase: "commit", generation: current.generation, startTime: commitStartedAt, totalMs: now() - commitStartedAt});
      } catch (error) {
        callbacks.onError?.(error, {phase: "commit", generation: current.generation});
        callbacks.onCancel?.("commit-error");
      }
      return;
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    pending = {generation: current.generation, cityId: current.cityId, target: targetValue, controller};
    callbacks.onPendingChange?.({generation: current.generation, cityId: current.cityId});
    Promise.resolve(callbacks.preflight(current.cityId, targetValue, {
      generation: current.generation,
      signal: controller?.signal,
      shouldContinue: () => pending?.generation === current.generation && sequence === current.generation
    })).then(fullPreview => {
      if (pending?.generation !== current.generation || sequence !== current.generation) return;
      pending = null;
      callbacks.onPendingChange?.(null);
      callbacks.onPreview?.(fullPreview);
      if (!fullPreview.valid || !fullPreview.changed) callbacks.onInvalid?.(fullPreview);
      else {
        const commitStartedAt = now();
        callbacks.onCommit?.(current.cityId, targetValue, fullPreview);
        callbacks.onPerformance?.({phase: "commit", generation: current.generation, startTime: commitStartedAt, totalMs: now() - commitStartedAt});
      }
      callbacks.onPerformance?.({phase: "preflight", generation: current.generation, startTime: pointerUpStartedAt, totalMs: now() - pointerUpStartedAt});
    }).catch(error => {
      if (error?.code === "operation_cancelled" || error?.name === "AbortError") return;
      callbacks.onError?.(error, {phase: "preflight", generation: current.generation});
      callbacks.onCancel?.("preflight-error");
    }).finally(() => {
      if (pending?.generation !== current.generation) return;
      pending = null;
      callbacks.onPendingChange?.(null);
    });
  };

  const onPointerCancel = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    cancelActive("pointercancel", true);
  };

  target.addEventListener("pointerdown", onPointerDown, true);
  target.addEventListener("pointermove", onPointerMove, true);
  target.addEventListener("pointerup", onPointerUp, true);
  target.addEventListener("pointercancel", onPointerCancel, true);
  return {
    cancel(reason = "cancel", notify = true) {
      return cancelActive(reason, notify);
    },
    dispose() {
      target.removeEventListener("pointerdown", onPointerDown, true);
      target.removeEventListener("pointermove", onPointerMove, true);
      target.removeEventListener("pointerup", onPointerUp, true);
      target.removeEventListener("pointercancel", onPointerCancel, true);
      cancelActive("dispose", false);
    },
    getActiveDrag() {
      return drag ? publicDrag(drag) : null;
    },
    getPendingPreflight() {
      return pending ? {generation: pending.generation, cityId: pending.cityId} : null;
    }
  };
}

export function resolveCityRelocationPointerCityId(pick, selectedCityId) {
  const object = pick?.cityObject || pick?.object;
  if (object?.kind !== "city") return null;
  const selected = Number(selectedCityId);
  if (Number.isInteger(selected) && object.overlapCandidateIds?.includes(selected)) return selected;
  const id = Number(object.id);
  return Number.isInteger(id) ? id : null;
}

function pointerSnapshot(event) {
  return {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    pointerType: event.pointerType,
    cityId: event.cityId,
    targetCell: event.targetCell
  };
}

function publicDrag(drag) {
  return {pointerId: drag.pointerId, cityId: drag.cityId, generation: drag.generation};
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
