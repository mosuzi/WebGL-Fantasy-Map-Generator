const activeSessions = new Set();

export function beginDirectManipulationSession({
  kind,
  pointerId = null,
  captureTarget = null,
  documentRef = captureTarget?.ownerDocument || null,
  scopeElement = captureTarget?.closest?.(".floating-panel") || null,
  ownerId = null,
  onCommit = null,
  onRollback = null,
  onCleanup = null
} = {}) {
  let active = true;
  const session = {
    kind: String(kind || "direct-manipulation"),
    pointerId,
    documentRef,
    scopeElement,
    ownerId: ownerId === null ? null : String(ownerId),
    get active() {
      return active;
    },
    finish(reason = "cancel", detail = null) {
      if (!active) return false;
      active = false;
      activeSessions.delete(session);
      const commit = reason === "pointerup";
      try {
        if (commit) onCommit?.({reason, detail, session});
        else onRollback?.({reason, detail, session});
      } finally {
        releaseCapture(captureTarget, pointerId);
        onCleanup?.({reason, detail, commit, session});
      }
      return true;
    },
    commit(detail = null) {
      return session.finish("pointerup", detail);
    },
    cancel(reason = "cancel", detail = null) {
      return session.finish(reason, detail);
    }
  };
  activeSessions.add(session);
  return session;
}

export function cancelAllDirectManipulationSessions(reason = "cancel", {documentRef = null, scopeElement = null, ownerId = null} = {}) {
  let cancelled = 0;
  for (const session of [...activeSessions]) {
    if (documentRef && session.documentRef !== documentRef) continue;
    if (scopeElement && session.scopeElement !== scopeElement) continue;
    if (ownerId !== null && session.ownerId !== String(ownerId)) continue;
    if (session.cancel(reason)) cancelled++;
  }
  return cancelled;
}

export function getDirectManipulationSessionSnapshot() {
  return [...activeSessions].map(session => ({
    kind: session.kind,
    pointerId: session.pointerId,
    ownerId: session.ownerId
  }));
}

function releaseCapture(target, pointerId) {
  if (!target || pointerId === null || pointerId === undefined) return;
  try {
    if (!target.hasPointerCapture || target.hasPointerCapture(pointerId)) target.releasePointerCapture?.(pointerId);
  } catch {
    // 捕获可能已由浏览器在取消路径释放。
  }
}
