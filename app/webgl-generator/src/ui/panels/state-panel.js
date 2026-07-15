import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const STATE_PANEL_ID = "state-panel";
const STATE_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  governmentLabel: 84,
  capitalName: 112,
  burgs: 64,
  population: 92,
  economicPower: 64,
  resourcePotential: 64
});
const STATE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: STATE_COLUMN_WIDTHS,
  sortKey: "population",
  sortDir: "desc"
});

export function createStatePanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, STATE_PANEL_ID, STATE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    active: false,
    map: null,
    targetStateId: null,
    sourceStateId: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    radius: 28,
    addMode: false,
    deleteMode: false,
    lastAffected: 0,
    history: null,
    version: 0
  });
  const panelCallbacks = {
    onActiveChange: active => {
      panelState.active = active;
      callbacks.onActiveChange?.(active);
    },
    onTargetStateId: stateId => {
      panelState.targetStateId = normalizeStateId(stateId);
    },
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, STATE_PANEL_ID, {filter: value}, STATE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "name" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, STATE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, STATE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, STATE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, STATE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.targetStateId = row.id;
      callbacks.onSelect?.(stateObject(row));
    },
    onLocate: row => callbacks.onLocate?.(stateObject(row)),
    onRegenerate: () => callbacks.onRegenerate?.(),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, stateObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onEdit: row => {
      const nextActive = !(panelState.active && panelState.targetStateId === row.id);
      panelState.targetStateId = row.id;
      panelState.active = nextActive;
      panelState.addMode = false;
      panelState.deleteMode = false;
      callbacks.onActiveChange?.(nextActive);
      if (nextActive) callbacks.onEdit?.(stateObject(row));
    },
    onAddMode: active => {
      panelState.addMode = Boolean(active);
      if (active) {
        panelState.active = false;
        panelState.deleteMode = false;
      }
      callbacks.onAddMode?.(panelState.addMode);
    },
    onDeleteMode: active => {
      panelState.deleteMode = Boolean(active);
      if (active) {
        panelState.active = false;
        panelState.addMode = false;
      }
      callbacks.onDeleteMode?.(panelState.deleteMode);
    },
    onDeleteState: stateId => callbacks.onDeleteState?.(stateId),
    onRename: (stateId, name) => callbacks.onRename?.(stateId, name),
    onRenameVisibleFromNamebase: stateIds => callbacks.onRenameVisibleFromNamebase?.(stateIds),
    onRadius: radius => {
      panelState.radius = radius;
    },
    onColorChange: (stateId, color) => callbacks.onColorChange?.(stateId, color),
    onGovernmentChange: (stateId, governmentKey) => callbacks.onGovernmentChange?.(stateId, governmentKey),
    onCapitalChange: (stateId, burgId) => callbacks.onCapitalChange?.(stateId, burgId),
    onNoteChange: (stateId, body) => callbacks.onNoteChange?.(stateId, body),
    onSampleSelection: () => callbacks.onSampleSelection?.(),
    onSampleHover: () => callbacks.onSampleHover?.(),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(STATE_PANEL_ID, {
    title: "国家编辑",
    left: 400,
    top: 128,
    width: 560,
    maxWidth: 680,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      panelState.active = false;
      panelState.addMode = false;
      panelState.deleteMode = false;
      callbacks.onActiveChange?.(false);
      callbacks.onAddMode?.(false);
      callbacks.onDeleteMode?.(false);
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-state-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/StatePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "国家编辑将在首次打开时加载。",
      loading: "正在加载国家编辑...",
      failure: "国家编辑加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (panelState.targetStateId === null) panelState.targetStateId = firstStateId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("state-panel");
      lazyPanel.load();
    },
    update({map = panelState.map, sourceStateId = panelState.sourceStateId, lastAffected = panelState.lastAffected, history = panelState.history} = {}) {
      panelState.map = map ? markRaw(map) : null;
      panelState.sourceStateId = sourceStateId;
      panelState.lastAffected = lastAffected;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (!stateExists(map, panelState.targetStateId)) panelState.targetStateId = firstStateId(map);
      panelState.version++;
    },
    updateAddMode(active) {
      panelState.addMode = Boolean(active);
      panelState.version++;
    },
    updateDeleteMode(active) {
      panelState.deleteMode = Boolean(active);
      panelState.version++;
    },
    getBrush() {
      return {
        active: panelState.active,
        targetStateId: panelState.targetStateId,
        radius: panelState.radius
      };
    },
    setTargetStateId(stateId) {
      const normalized = normalizeStateId(stateId);
      panelState.targetStateId = stateExists(panelState.map, normalized) ? normalized : panelState.targetStateId;
    },
    setActive(active) {
      const nextActive = Boolean(active);
      const changed = panelState.active !== nextActive;
      panelState.active = nextActive;
      if (nextActive) {
        panelState.addMode = false;
        panelState.deleteMode = false;
      }
      if (changed) callbacks.onActiveChange?.(nextActive);
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
    name: row.rawName,
    fullName: row.fullName,
    government: row.governmentLabel,
    governmentKey: row.governmentKey,
    capitalName: row.capitalName,
    culture: row.culture,
    religion: row.religion,
    centerCell: row.centerCell,
    population: roundNumber(row.population),
    burgs: row.burgs,
    area: roundNumber(row.area)
  };
}

function stateRows(map) {
  const rows = (map?.politics?.states || []).filter(state => state?.i || state?.id).map(state => ({
    id: state.id ?? state.i,
    name: state.fullName || state.name || `国家 #${state.id ?? state.i}`,
    rawName: state.name || state.fullName || `国家 #${state.id ?? state.i}`,
    fullName: state.fullName || state.name || `国家 #${state.id ?? state.i}`,
    governmentLabel: state.governmentLabel || state.governmentKey || "",
    governmentKey: state.governmentKey || "",
    capitalName: state.capitalName || ""
  }));
  return map?.politics?.states?.[0] ? [{id: 0, name: "中立", rawName: "中立", fullName: "中立"}, ...rows] : rows;
}

function firstStateId(map) {
  return stateRows(map).find(row => row.id > 0)?.id ?? stateRows(map)[0]?.id ?? null;
}

function stateExists(map, stateId) {
  stateId = normalizeStateId(stateId);
  if (stateId === null || stateId === undefined) return false;
  if (stateId === 0) return Boolean(map?.politics?.states?.[0]);
  return Boolean(map?.politics?.states?.[stateId]);
}

function normalizeStateId(stateId) {
  return toIntegerId(stateId);
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
