import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";

const RIVER_PANEL_ID = "river-panel";
const RIVER_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  type: 64,
  length: 84,
  flux: 96
});
const RIVER_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: RIVER_COLUMN_WIDTHS,
  sortKey: "flux",
  sortDir: "desc"
});

export function createRiverPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, RIVER_PANEL_ID, RIVER_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    editingObject: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readHighlightCount(callbacks),
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, RIVER_PANEL_ID, {filter: value}, RIVER_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, RIVER_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, RIVER_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, RIVER_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, RIVER_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => callbacks.onSelect?.(riverObject(row)),
    onLocate: row => callbacks.onLocate?.(riverObject(row)),
    onHighlight: rows => {
      callbacks.onHighlight?.(rows.map(riverObject));
      panelState.highlightCount = readHighlightCount(callbacks);
    },
    onClearHighlights: () => {
      callbacks.onClearHighlights?.();
      panelState.highlightCount = readHighlightCount(callbacks);
    },
    onEdit: row => callbacks.onEdit?.(riverObject(row)),
    onRename: (riverId, name) => callbacks.onRename?.(riverId, name),
    onRenameVisibleFromNamebase: riverIds => callbacks.onRenameVisibleFromNamebase?.(riverIds),
    onSetWidthFactor: (riverId, widthFactor) => callbacks.onSetWidthFactor?.(riverId, widthFactor),
    onNoteChange: (riverId, body) => callbacks.onNoteChange?.(riverId, body),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(RIVER_PANEL_ID, {
    title: "河流管理",
    left: 380,
    top: 56,
    width: 520,
    maxWidth: 620,
    historyActions: {
      getHistory: () => panelState.history,
      onUndo: panelCallbacks.onUndo,
      onRedo: panelCallbacks.onRedo
    },
    onClose: () => {
      panelState.open = false;
      callbacks.onClose?.();
    }
  });
  const root = documentRef.createElement("div");
  root.className = "vue-river-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/RiverPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "河流管理将在首次打开时加载。",
      loading: "正在加载河流管理...",
      failure: "河流管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history, editingObject = panelState.editingObject) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.editingObject = editingObject;
      panelState.history = history;
      panelState.highlightCount = readHighlightCount(callbacks);
      panelState.open = true;
      panelState.version++;
      manager.open("river-panel");
      lazyPanel.load();
    },
    update(map, selection, history, editingObject = panelState.editingObject) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.editingObject = editingObject;
      panelState.history = history;
      panelState.highlightCount = readHighlightCount(callbacks);
      panelState.version++;
    },
    setSelection(selection, editingObject = panelState.editingObject) {
      panelState.selection = selection;
      panelState.editingObject = editingObject;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function riverObject(row) {
  return {
    kind: "river",
    id: row.id,
    name: row.name,
    type: row.type,
    flux: row.flux,
    length: Math.round(row.length),
    distance: 0
  };
}

function readHighlightCount(callbacks) {
  return Math.max(0, Number(callbacks.getHighlightCount?.()) || 0);
}
