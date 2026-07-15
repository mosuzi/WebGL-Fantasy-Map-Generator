export function createCanvasToolModeManager() {
  const registrations = new Map();
  let active = null;
  let transition = null;
  let queued = null;
  let sequence = 0;
  let lastTransition = null;

  function register(id, hooks = {}) {
    const modeId = normalizeModeId(id);
    if (registrations.has(modeId)) throw new Error(`画布工具模式已注册：${modeId}`);
    const registration = {
      id: modeId,
      locksInteraction: hooks.locksInteraction !== false,
      allowedPanelIds: normalizePanelIds(hooks.allowedPanelIds),
      onEnter: callable(hooks.onEnter),
      onRepeat: callable(hooks.onRepeat),
      onCancel: callable(hooks.onCancel),
      onComplete: callable(hooks.onComplete),
      onError: callable(hooks.onError)
    };
    registrations.set(modeId, registration);
    return () => {
      if (active?.id === modeId) cancel(modeId, "unregister");
      registrations.delete(modeId);
    };
  }

  function enter(id, context = {}, {reason = "enter"} = {}) {
    return request({type: "enter", id: normalizeModeId(id), context, reason});
  }

  function cancel(expectedId = null, reason = "cancel") {
    return request({type: "cancel", expectedId: expectedId ? normalizeModeId(expectedId) : null, reason});
  }

  function complete(expectedId = null, detail = {}, {keepActive = false, reason = "complete"} = {}) {
    return request({
      type: "complete",
      expectedId: expectedId ? normalizeModeId(expectedId) : null,
      detail,
      keepActive: Boolean(keepActive),
      reason
    });
  }

  function reset(reason = "reset") {
    return cancel(null, reason);
  }

  function request(nextTransition) {
    if (transition) {
      queued = nextTransition;
      return result(false, "queued", active);
    }
    transition = nextTransition;
    let current = nextTransition;
    let response = null;
    try {
      while (current) {
        queued = null;
        response = applyTransition(current);
        current = queued;
      }
      return response;
    } finally {
      transition = null;
      queued = null;
    }
  }

  function applyTransition(nextTransition) {
    if (nextTransition.type === "enter") return applyEnter(nextTransition);
    if (nextTransition.type === "complete") return applyComplete(nextTransition);
    return applyCancel(nextTransition);
  }

  function applyEnter({id, context, reason}) {
    const registration = registrations.get(id);
    if (!registration) throw new Error(`画布工具模式未注册：${id}`);
    if (active?.id === id) {
      const entry = active;
      entry.context = normalizeContext(context);
      try {
        invokeHook(entry, "onRepeat", {reason});
      } catch (error) {
        if (active === entry) active = null;
        try {
          entry.registration.onCancel?.(transitionPayload(entry, {reason: "repeat-error", error}));
        } catch {
          active = null;
        }
        throw error;
      }
      record("repeat", entry, {reason});
      return result(false, "already-active", entry);
    }
    if (active) exitActive("cancel", {reason: "switch", nextModeId: id});

    const entry = {id, context: normalizeContext(context), registration};
    active = entry;
    try {
      registration.onEnter?.(transitionPayload(entry, {reason}));
    } catch (error) {
      if (active === entry) active = null;
      safeCleanupAfterEnterError(entry, error);
      record("error", entry, {reason: "enter-error", error});
      throw error;
    }
    record("enter", entry, {reason});
    return result(true, "entered", active);
  }

  function applyCancel({expectedId, reason}) {
    if (!active || (expectedId && active.id !== expectedId)) return result(false, "not-active", active);
    const exited = exitActive("cancel", {reason});
    return result(true, "cancelled", exited);
  }

  function applyComplete({expectedId, detail, keepActive, reason}) {
    if (!active || (expectedId && active.id !== expectedId)) return result(false, "not-active", active);
    if (keepActive) {
      const entry = active;
      invokeHook(entry, "onComplete", {reason, detail, keepActive: true});
      record("complete", entry, {reason, keepActive: true});
      return result(true, "completed", active);
    }
    const exited = exitActive("complete", {reason, detail, keepActive: false});
    return result(true, "completed", exited);
  }

  function exitActive(kind, extra) {
    const entry = active;
    active = null;
    invokeHook(entry, kind === "complete" ? "onComplete" : "onCancel", extra);
    record(kind, entry, extra);
    return entry;
  }

  function invokeHook(entry, hook, extra) {
    try {
      entry.registration[hook]?.(transitionPayload(entry, extra));
    } catch (error) {
      notifyError(entry, {...extra, error, phase: hook});
      record("error", entry, {...extra, error, phase: hook});
      throw error;
    }
  }

  function safeCleanupAfterEnterError(entry, error) {
    try {
      entry.registration.onCancel?.(transitionPayload(entry, {reason: "enter-error", error}));
    } catch (cleanupError) {
      notifyError(entry, {reason: "enter-error", error: cleanupError, cause: error, phase: "onCancel"});
    }
    notifyError(entry, {reason: "enter-error", error, phase: "onEnter"});
  }

  function notifyError(entry, extra) {
    try {
      entry.registration.onError?.(transitionPayload(entry, extra));
    } catch {
      return false;
    }
    return true;
  }

  function record(type, entry, extra = {}) {
    sequence++;
    lastTransition = {
      sequence,
      type,
      modeId: entry?.id || null,
      reason: extra.reason || type,
      nextModeId: extra.nextModeId || null,
      keepActive: Boolean(extra.keepActive),
      error: extra.error ? String(extra.error.message || extra.error) : null
    };
  }

  function getActive() {
    return activeSnapshot(active);
  }

  function getSnapshot() {
    return {
      active: activeSnapshot(active),
      registeredModeIds: [...registrations.keys()],
      sequence,
      lastTransition: lastTransition ? {...lastTransition} : null,
      transitioning: Boolean(transition)
    };
  }

  return {
    register,
    enter,
    cancel,
    complete,
    reset,
    isActive: id => active?.id === id,
    getActive,
    getSnapshot
  };
}

function transitionPayload(entry, extra = {}) {
  return {
    modeId: entry.id,
    context: entry.context,
    ...extra
  };
}

function activeSnapshot(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    context: entry.context,
    locksInteraction: entry.registration.locksInteraction,
    allowedPanelIds: [...entry.registration.allowedPanelIds]
  };
}

function result(changed, status, entry) {
  return {changed, status, active: activeSnapshot(entry)};
}

function normalizeModeId(id) {
  const normalized = String(id || "").trim();
  if (!normalized) throw new Error("画布工具模式 ID 不能为空");
  return normalized;
}

function normalizePanelIds(panelIds) {
  return [...new Set((panelIds || []).map(value => String(value || "").trim()).filter(Boolean))];
}

function normalizeContext(context) {
  return context && typeof context === "object" ? context : {};
}

function callable(value) {
  return typeof value === "function" ? value : null;
}
