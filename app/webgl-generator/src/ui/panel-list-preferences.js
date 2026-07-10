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
  const normalized = {
    filter: typeof value.filter === "string" ? value.filter : defaults.filter || "",
    sortKey: typeof value.sortKey === "string" && value.sortKey ? value.sortKey : defaults.sortKey || "id",
    sortDir: sortDir === "asc" || sortDir === "desc" ? sortDir : "asc"
  };
  if (typeof defaults.tab === "string") normalized.tab = normalizePanelTab(value.tab, defaults);
  if (typeof defaults.importMode === "string") normalized.importMode = normalizePreferenceValue(
    value.importMode,
    defaults.importMode,
    defaults.importModes
  );
  if (typeof defaults.scope === "string") normalized.scope = normalizePreferenceValue(
    value.scope,
    defaults.scope,
    defaults.scopes
  );
  if (typeof defaults.treeOpen === "boolean") {
    normalized.treeOpen = typeof value.treeOpen === "boolean" ? value.treeOpen : defaults.treeOpen;
  }
  return normalized;
}

function storageKey(panelId) {
  return `${PANEL_LIST_PREFERENCES_PREFIX}${panelId}`;
}

function normalizePanelTab(value, defaults) {
  const tab = typeof value === "string" && value ? value : defaults.tab;
  const allowed = Array.isArray(defaults.tabs) ? defaults.tabs : null;
  return !allowed || allowed.includes(tab) ? tab : defaults.tab;
}

function normalizePreferenceValue(value, fallback, allowedValues = null) {
  const normalized = typeof value === "string" && value ? value : fallback;
  return !Array.isArray(allowedValues) || allowedValues.includes(normalized) ? normalized : fallback;
}
