import {normalizeRegenerationLockReference, regenerationLockKey} from "./regeneration-locks.js";

const sessions = new WeakMap();

export function installRegenerationLockUiSession(documentRef, options = {}) {
  const session = createRegenerationLockUiSession(options);
  sessions.set(documentRef, session);
  documentRef.addEventListener("fmg:panel-close", event => session.closePanel(event.detail?.panelId));
  return session;
}

export function getRegenerationLockUiSession(documentRef = globalThis.document) {
  return documentRef ? sessions.get(documentRef) || null : null;
}

export function createRegenerationLockUiSession({
  getMap = () => null,
  setLock = () => ({executed: false}),
  setLocks = () => ({executed: false}),
  startMapSelection = () => false,
  stopMapSelection = () => false,
  updateHighlights = () => {}
} = {}) {
  const listeners = new Set();
  let panelId = null;
  let kind = null;
  let selected = new Map();
  let mapSelectionActive = false;

  function snapshot() {
    const map = getMap();
    const lockedKeys = new Set((map?.regenerationLocks?.entries || []).map(regenerationLockKey));
    const references = [...selected.values()];
    return {
      panelId,
      kind,
      selectedReferences: references,
      selectedIds: references.map(reference => reference.id),
      selectedCount: references.length,
      lockedKeys,
      mapSelectionActive
    };
  }

  function notify() {
    const next = snapshot();
    for (const listener of listeners) listener(next);
    updateHighlights(next.selectedReferences, {active: mapSelectionActive});
    return next;
  }

  function activate(nextPanelId, nextKind) {
    const normalizedPanelId = String(nextPanelId || "");
    const normalizedKind = String(nextKind || "");
    if (panelId === normalizedPanelId && kind === normalizedKind) return snapshot();
    if (mapSelectionActive) stopMapSelection("session-switch");
    panelId = normalizedPanelId;
    kind = normalizedKind;
    selected = new Map();
    mapSelectionActive = false;
    return notify();
  }

  function replace(nextPanelId, nextKind, references) {
    activate(nextPanelId, nextKind);
    selected = referenceMap(references, kind);
    return notify();
  }

  function toggle(nextPanelId, nextKind, reference) {
    activate(nextPanelId, nextKind);
    const normalized = normalizeReference(reference);
    const key = normalized ? regenerationLockKey(normalized) : "";
    if (!key || normalized.kind !== kind) return snapshot();
    if (selected.has(key)) selected.delete(key);
    else selected.set(key, normalized);
    return notify();
  }

  function toggleRange(nextPanelId, nextKind, references, selectedState) {
    activate(nextPanelId, nextKind);
    for (const reference of references || []) {
      const normalized = normalizeReference(reference);
      const key = normalized ? regenerationLockKey(normalized) : "";
      if (!key || normalized.kind !== kind) continue;
      if (selectedState) selected.set(key, normalized);
      else selected.delete(key);
    }
    return notify();
  }

  function clear({keepContext = true} = {}) {
    if (mapSelectionActive) stopMapSelection("selection-clear");
    selected = new Map();
    mapSelectionActive = false;
    if (!keepContext) {
      panelId = null;
      kind = null;
    }
    return notify();
  }

  function apply(locked) {
    const references = [...selected.values()];
    if (!references.length) return {executed: false, reason: "empty"};
    const result = setLocks(references, Boolean(locked));
    notify();
    return result;
  }

  function setOne(reference, locked) {
    const result = setLock(reference, Boolean(locked));
    notify();
    return result;
  }

  function beginMapSelection(nextPanelId, nextKind, context = {}) {
    activate(nextPanelId, nextKind);
    if (!panelId || !kind) return false;
    const entered = startMapSelection({...context, panelId, kind}) !== false;
    mapSelectionActive = entered;
    notify();
    return entered;
  }

  function finishMapSelection(reason = "cancel", {clearSelection = true} = {}) {
    if (!mapSelectionActive && !clearSelection) return snapshot();
    mapSelectionActive = false;
    if (clearSelection) selected = new Map();
    const next = notify();
    return {...next, reason};
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    snapshot,
    activate,
    replace,
    toggle,
    toggleRange,
    clear,
    apply,
    setOne,
    beginMapSelection,
    finishMapSelection,
    closePanel(closedPanelId) {
      if (panelId !== closedPanelId) return false;
      clear({keepContext: false});
      return true;
    },
    mapPicked(reference) {
      if (!mapSelectionActive || reference?.kind !== kind) return false;
      toggle(panelId, kind, reference);
      return true;
    }
  };
}

function referenceMap(references, kind) {
  const values = new Map();
  for (const reference of references || []) {
    const normalized = normalizeReference(reference);
    const key = normalized ? regenerationLockKey(normalized) : "";
    if (!key || normalized.kind !== kind) continue;
    values.set(key, normalized);
  }
  return values;
}

function normalizeReference(reference) {
  try {
    return normalizeRegenerationLockReference(reference);
  } catch {
    return null;
  }
}
