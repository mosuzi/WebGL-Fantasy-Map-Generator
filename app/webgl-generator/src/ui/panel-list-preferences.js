const PANEL_LIST_PREFERENCES_PREFIX = "webgl-generator-panel-list:";
const MIN_COLUMN_WIDTH = 32;
const MAX_COLUMN_WIDTH = 640;

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
  if (typeof defaults.familyFilter === "string") normalized.familyFilter = normalizePreferenceValue(
    value.familyFilter,
    defaults.familyFilter,
    defaults.familyFilters
  );
  if (Object.hasOwn(defaults, "stateFilter")) {
    normalized.stateFilter = normalizeStateFilter(value.stateFilter, defaults.stateFilter);
  }
  if (typeof defaults.statusFilter === "string") normalized.statusFilter = normalizePreferenceValue(
    value.statusFilter,
    defaults.statusFilter,
    defaults.statusFilters
  );
  if (typeof defaults.eventChainFilter === "string") normalized.eventChainFilter = normalizePreferenceValue(
    value.eventChainFilter,
    defaults.eventChainFilter,
    defaults.eventChainFilters
  );
  if (typeof defaults.eventTypeFilter === "string") normalized.eventTypeFilter = normalizePreferenceValue(
    value.eventTypeFilter,
    defaults.eventTypeFilter,
    defaults.eventTypeFilters
  );
  if (typeof defaults.eventOutcomeFilter === "string") normalized.eventOutcomeFilter = normalizePreferenceValue(
    value.eventOutcomeFilter,
    defaults.eventOutcomeFilter,
    defaults.eventOutcomeFilters
  );
  if (typeof defaults.eventApplyFilter === "string") normalized.eventApplyFilter = normalizePreferenceValue(
    value.eventApplyFilter,
    defaults.eventApplyFilter,
    defaults.eventApplyFilters
  );
  if (typeof defaults.treeOpen === "boolean") {
    normalized.treeOpen = typeof value.treeOpen === "boolean" ? value.treeOpen : defaults.treeOpen;
  }
  if (isPlainObject(defaults.columnWidths)) {
    normalized.columnWidths = normalizeColumnWidths(value.columnWidths, defaults.columnWidths);
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

function normalizeStateFilter(value, fallback = "all") {
  if (value === "all") return "all";
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeColumnWidths(value, defaults = {}) {
  const source = isPlainObject(value) ? value : {};
  return Object.fromEntries(
    Object.keys(defaults).map(key => [key, normalizeColumnWidth(source[key], defaults[key])])
  );
}

function normalizeColumnWidth(value, fallback) {
  const width = Number(value);
  const fallbackWidth = Number(fallback);
  const base = Number.isFinite(width) ? width : fallbackWidth;
  if (!Number.isFinite(base)) return MIN_COLUMN_WIDTH;
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, base)));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
