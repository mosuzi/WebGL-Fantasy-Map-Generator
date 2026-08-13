import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const GOVERNMENT_PANEL_ID = "government-panel";
const GOVERNMENT_COLUMN_WIDTHS = Object.freeze({
  "governments.label": 132,
  "governments.category": 112,
  "governments.count": 70,
  "governments.population": 92,
  "governments.economicPower": 78,
  "governments.militaryPower": 78,
  "states.id": 56,
  "states.name": 132,
  "states.population": 92,
  "states.economicPower": 78,
  "states.militaryPower": 78,
  "states.capitalName": 80
});
const GOVERNMENT_LIST_DEFAULTS = Object.freeze({
  filter: "",
  familyFilter: "all",
  columnWidths: GOVERNMENT_COLUMN_WIDTHS,
  columnWidthVersion: 2,
  columnWidthMigrations: {
    "states.capitalName": {from: 112, to: 80}
  },
  sortKey: "count",
  sortDir: "desc"
});

export function createGovernmentPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, GOVERNMENT_PANEL_ID, GOVERNMENT_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    familyFilter: listPreferences.familyFilter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    selectedGovernmentKey: null,
    selectedStateId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, GOVERNMENT_PANEL_ID, {filter: value}, GOVERNMENT_LIST_DEFAULTS);
    },
    onFamilyFilter: value => {
      panelState.familyFilter = String(value || "all");
      updatePanelListPreferences(documentRef, GOVERNMENT_PANEL_ID, {familyFilter: panelState.familyFilter}, GOVERNMENT_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "label" || key === "category" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, GOVERNMENT_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, GOVERNMENT_LIST_DEFAULTS);
    },
    onColumnResize: ({table, key, width} = {}) => {
      if (!table || !key || !Number.isFinite(width)) return;
      const storageKey = `${table}.${key}`;
      const next = updatePanelListPreferences(documentRef, GOVERNMENT_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [storageKey]: width
        }
      }, GOVERNMENT_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelectGovernment: row => {
      panelState.selectedGovernmentKey = row.key;
      panelState.selectedStateId = null;
    },
    onSelectState: row => {
      panelState.selectedStateId = normalizeStateId(row.id);
      callbacks.onSelectState?.(stateObject(row));
    },
    onLocateState: row => callbacks.onLocateState?.(stateObject(row)),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, stateObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onOpenState: row => callbacks.onOpenState?.(stateObject(row)),
    onOpenDiplomacy: row => callbacks.onOpenDiplomacy?.(stateObject(row)),
    onBatchGovernmentChange: (stateIds, governmentKey) => callbacks.onBatchGovernmentChange?.(stateIds, governmentKey),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(GOVERNMENT_PANEL_ID, {
    title: "政体管理",
    left: 520,
    top: 132,
    width: 720,
    maxWidth: 920,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-government-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/GovernmentPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "政体管理将在首次打开时加载。",
      loading: "正在打开政体管理，请稍候片刻。",
      failure: "政体管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "state") {
        panelState.selectedStateId = normalizeStateId(selection.object.id);
        panelState.selectedGovernmentKey = map?.politics?.states?.[panelState.selectedStateId]?.governmentKey || panelState.selectedGovernmentKey;
      }
      if (!governmentExists(map, panelState.selectedGovernmentKey)) panelState.selectedGovernmentKey = firstGovernmentKey(map);
      if (!stateExists(map, panelState.selectedStateId, panelState.selectedGovernmentKey)) panelState.selectedStateId = firstStateId(map, panelState.selectedGovernmentKey);
      panelState.version++;
      panelState.open = true;
      manager.open("government-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (!governmentExists(map, panelState.selectedGovernmentKey)) panelState.selectedGovernmentKey = firstGovernmentKey(map);
      if (!stateExists(map, panelState.selectedStateId, panelState.selectedGovernmentKey)) panelState.selectedStateId = firstStateId(map, panelState.selectedGovernmentKey);
      panelState.version++;
    },
    setSelectedStateId(stateId) {
      const normalized = normalizeStateId(stateId);
      if (!stateExists(panelState.map, normalized)) return;
      panelState.selectedStateId = normalized;
      panelState.selectedGovernmentKey = panelState.map?.politics?.states?.[normalized]?.governmentKey || panelState.selectedGovernmentKey;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function stateObject(row) {
  return {
    kind: "state",
    id: row.id,
    name: row.rawName || row.name,
    fullName: row.name,
    government: row.governmentLabel,
    governmentKey: row.governmentKey,
    centerCell: row.centerCell,
    population: row.population,
    burgs: row.burgs,
    area: row.area
  };
}

function firstGovernmentKey(map) {
  return governmentRows(map)[0]?.key ?? null;
}

function firstStateId(map, governmentKey = null) {
  return stateRows(map, governmentKey)[0]?.id ?? null;
}

function governmentExists(map, governmentKey) {
  return Boolean(governmentKey && governmentRows(map).some(row => row.key === governmentKey));
}

function stateExists(map, stateId, governmentKey = null) {
  stateId = normalizeStateId(stateId);
  if (!Number.isInteger(stateId) || stateId <= 0) return false;
  const stateItem = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
  if (!stateItem || stateItem.removed) return false;
  return !governmentKey || (stateItem.governmentKey || "unknown") === governmentKey;
}

function stateRows(map, governmentKey = null) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .filter(state => !governmentKey || (state.governmentKey || "unknown") === governmentKey)
    .map(state => ({
      id: state.i ?? state.id,
      name: state.fullName || state.name || `国家 #${state.i ?? state.id}`
    }));
}

function governmentRows(map) {
  const groups = new Map();
  for (const state of map?.politics?.states || map?.pack?.states || []) {
    if (!state?.i || state.removed) continue;
    const key = state.governmentKey || "unknown";
    if (!groups.has(key)) groups.set(key, {key});
  }
  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key, "zh-CN"));
}

function normalizeStateId(stateId) {
  return toIntegerId(stateId);
}
