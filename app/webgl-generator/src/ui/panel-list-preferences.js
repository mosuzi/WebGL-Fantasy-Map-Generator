const PANEL_LIST_PREFERENCES_PREFIX = "webgl-generator-panel-list:";

export function readPanelListPreferences(documentRef, panelId, defaults = {}) {
  try {
    const raw = documentRef.defaultView?.localStorage?.getItem(storageKey(panelId));
    if (!raw) return normalizePanelListPreferences(defaults, defaults);
    return normalizePanelListPreferences({...defaults, ...JSON.parse(raw)}, defaults);
  } catch {
    return normalizePanelListPreferences(defaults, defaults);
  }
}

export function updatePanelListPreferences(documentRef, panelId, patch, defaults = {}) {
  const next = normalizePanelListPreferences({
    ...readPanelListPreferences(documentRef, panelId, defaults),
    ...(patch || {})
  }, defaults);
  try {
    documentRef.defaultView?.localStorage?.setItem(storageKey(panelId), JSON.stringify(next));
  } catch {
    // localStorage may be unavailable in restricted browser modes.
  }
  return next;
}

function normalizePanelListPreferences(value = {}, defaults = {}) {
  const sortDir = value.sortDir === "asc" || value.sortDir === "desc" ? value.sortDir : defaults.sortDir;
  return {
    filter: typeof value.filter === "string" ? value.filter : defaults.filter || "",
    sortKey: typeof value.sortKey === "string" && value.sortKey ? value.sortKey : defaults.sortKey || "id",
    sortDir: sortDir === "asc" || sortDir === "desc" ? sortDir : "asc"
  };
}

function storageKey(panelId) {
  return `${PANEL_LIST_PREFERENCES_PREFIX}${panelId}`;
}
