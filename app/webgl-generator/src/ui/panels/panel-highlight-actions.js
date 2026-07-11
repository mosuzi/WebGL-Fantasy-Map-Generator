export function readPanelHighlightCount(callbacks) {
  return Math.max(0, Number(callbacks.getHighlightCount?.()) || 0);
}

export function syncPanelHighlightCount(panelState, callbacks) {
  panelState.highlightCount = readPanelHighlightCount(callbacks);
  return panelState.highlightCount;
}

export function highlightPanelRows(panelState, callbacks, rows, toObject) {
  callbacks.onHighlight?.((Array.isArray(rows) ? rows : []).map(toObject));
  return syncPanelHighlightCount(panelState, callbacks);
}

export function clearPanelHighlights(panelState, callbacks) {
  callbacks.onClearHighlights?.();
  return syncPanelHighlightCount(panelState, callbacks);
}
