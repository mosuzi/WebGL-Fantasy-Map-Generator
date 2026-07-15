import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const MARKER_PANEL_ID = "marker-panel";
const MARKER_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  name: 120,
  categoryLabel: 84,
  resourceLabel: 84,
  stateName: 112,
  economicValue: 64
});
const MARKER_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: MARKER_COLUMN_WIDTHS,
  scope: "all",
  scopes: Object.freeze(["all", "resource", "marker"]),
  sortKey: "economicValue",
  sortDir: "desc"
});

export function createMarkerPanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, MARKER_PANEL_ID, MARKER_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    scope: listPreferences.scope,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    selectedMarkerId: null,
    editMode: null,
    editType: null,
    editMarkerId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, MARKER_PANEL_ID, {filter: value}, MARKER_LIST_DEFAULTS);
    },
    onScope: value => {
      panelState.scope = value === "resource" || value === "marker" ? value : "all";
      updatePanelListPreferences(documentRef, MARKER_PANEL_ID, {scope: panelState.scope}, MARKER_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "name" || key === "categoryLabel" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, MARKER_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, MARKER_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, MARKER_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, MARKER_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedMarkerId = row.id;
      callbacks.onSelect?.(markerObject(row));
    },
    onLocate: row => {
      panelState.selectedMarkerId = row.id;
      callbacks.onLocate?.(markerObject(row));
    },
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, markerObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onRename: (markerId, name) => callbacks.onRename?.(markerId, name),
    onVisualChange: (markerId, patch) => callbacks.onVisualChange?.(markerId, patch),
    onNoteChange: (markerId, body) => callbacks.onNoteChange?.(markerId, body),
    onAddResourceMode: type => callbacks.onAddResourceMode?.(type),
    onMoveMode: markerId => callbacks.onMoveMode?.(markerId),
    onDelete: markerId => callbacks.onDelete?.(markerId),
    onRegenerateResources: () => callbacks.onRegenerateResources?.(),
    onCancelEdit: () => callbacks.onCancelEdit?.(),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(MARKER_PANEL_ID, {
    title: "资源与标记管理",
    left: 504,
    top: 96,
    width: 620,
    maxWidth: 760,
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
  root.className = "vue-marker-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/MarkerPanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "资源与标记管理将在首次打开时加载。",
      loading: "正在加载资源与标记管理...",
      failure: "资源与标记管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "marker") panelState.selectedMarkerId = normalizeMarkerId(selection.object.id);
      if (!markerExists(map, panelState.selectedMarkerId)) panelState.selectedMarkerId = firstMarkerId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("marker-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "marker") panelState.selectedMarkerId = normalizeMarkerId(selection.object.id);
      if (!markerExists(map, panelState.selectedMarkerId)) panelState.selectedMarkerId = firstMarkerId(map);
      panelState.version++;
    },
    setSelectedMarkerId(markerId) {
      const normalized = normalizeMarkerId(markerId);
      if (markerExists(panelState.map, normalized)) panelState.selectedMarkerId = normalized;
    },
    updateEditMode(editMode) {
      panelState.editMode = editMode?.mode || null;
      panelState.editType = editMode?.type || null;
      panelState.editMarkerId = Number.isInteger(editMode?.markerId) ? editMode.markerId : null;
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function markerObject(row) {
  return {
    kind: "marker",
    id: row.id,
    name: row.rawName,
    type: row.type,
    label: row.typeLabel,
    category: row.category,
    categoryLabel: row.categoryLabel,
    resourceKey: row.resourceKey,
    resourceLabel: row.resourceLabel,
    economicValue: row.economicValue,
    cell: row.cell,
    packCell: row.packCell,
    stateId: row.stateId,
    state: row.stateName,
    provinceId: row.provinceId,
    province: row.provinceName
  };
}

function markerExists(map, markerId) {
  markerId = normalizeMarkerId(markerId);
  return Boolean(Number.isInteger(markerId) && (map?.markers?.markers || []).some(marker => marker?.id === markerId));
}

function normalizeMarkerId(markerId) {
  return toIntegerId(markerId);
}

function firstMarkerId(map) {
  return (map?.markers?.markers || []).find(marker => marker && Number.isInteger(marker.id))?.id ?? null;
}
