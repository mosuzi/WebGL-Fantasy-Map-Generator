import {markRaw, shallowReactive} from "vue";
import {createLazyVuePanel} from "./lazy-vue-panel.js";
import {toIntegerId} from "../object-id.js";
import {readPanelListPreferences, updatePanelListPreferences} from "../panel-list-preferences.js";
import {clearPanelHighlights, highlightPanelRows, readPanelHighlightCount, syncPanelHighlightCount} from "./panel-highlight-actions.js";

const ROUTE_PANEL_ID = "route-panel";
const ROUTE_COLUMN_WIDTHS = Object.freeze({
  id: 56,
  typeLabel: 76,
  fromName: 112,
  toName: 112,
  resourceCells: 64,
  length: 84
});
const ROUTE_LIST_DEFAULTS = Object.freeze({
  filter: "",
  columnWidths: ROUTE_COLUMN_WIDTHS,
  sortKey: "length",
  sortDir: "desc"
});

export function createRoutePanel(documentRef, manager, callbacks = {}) {
  const listPreferences = readPanelListPreferences(documentRef, ROUTE_PANEL_ID, ROUTE_LIST_DEFAULTS);
  const panelState = shallowReactive({
    open: false,
    map: null,
    selection: null,
    history: null,
    filter: listPreferences.filter,
    columnWidths: listPreferences.columnWidths,
    sortKey: listPreferences.sortKey,
    sortDir: listPreferences.sortDir,
    highlightCount: readPanelHighlightCount(callbacks),
    createMode: false,
    selectedRouteId: null,
    version: 0
  });
  const panelCallbacks = {
    onFilter: value => {
      panelState.filter = value;
      updatePanelListPreferences(documentRef, ROUTE_PANEL_ID, {filter: value}, ROUTE_LIST_DEFAULTS);
    },
    onSort: key => {
      if (panelState.sortKey === key) {
        panelState.sortDir = panelState.sortDir === "asc" ? "desc" : "asc";
      } else {
        panelState.sortKey = key;
        panelState.sortDir = key === "id" || key === "type" || key === "fromName" ? "asc" : "desc";
      }
      updatePanelListPreferences(documentRef, ROUTE_PANEL_ID, {
        sortKey: panelState.sortKey,
        sortDir: panelState.sortDir
      }, ROUTE_LIST_DEFAULTS);
    },
    onColumnResize: ({key, width} = {}) => {
      if (!key || !Number.isFinite(width)) return;
      const next = updatePanelListPreferences(documentRef, ROUTE_PANEL_ID, {
        columnWidths: {
          ...panelState.columnWidths,
          [key]: width
        }
      }, ROUTE_LIST_DEFAULTS);
      panelState.columnWidths = next.columnWidths;
    },
    onSelect: row => {
      panelState.selectedRouteId = row.id;
      callbacks.onSelect?.(routeObject(row));
    },
    onLocate: row => callbacks.onLocate?.(routeObject(row)),
    onHighlight: rows => highlightPanelRows(panelState, callbacks, rows, routeObject),
    onClearHighlights: () => clearPanelHighlights(panelState, callbacks),
    onNoteChange: (routeId, body) => callbacks.onNoteChange?.(routeId, body),
    onDelete: row => callbacks.onDelete?.(routeObject(row)),
    onDeleteMany: routeIds => callbacks.onDeleteMany?.(routeIds),
    onCreateMode: active => callbacks.onCreateMode?.(active),
    onRegenerateRoutes: () => callbacks.onRegenerateRoutes?.(),
    onUndo: () => callbacks.onUndo?.(),
    onRedo: () => callbacks.onRedo?.()
  };

  const record = manager.registerPanel(ROUTE_PANEL_ID, {
    title: "路线管理",
    left: 460,
    top: 116,
    width: 560,
    maxWidth: 680,
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
  root.className = "vue-route-panel-root";
  record.body.replaceChildren(root);
  const lazyPanel = createLazyVuePanel(
    documentRef,
    root,
    () => import("../vue/components/RoutePanel.vue"),
    {state: panelState, callbacks: panelCallbacks},
    {
      initial: "路线管理将在首次打开时加载。",
      loading: "正在加载路线管理...",
      failure: "路线管理加载失败，请检查开发模式日志。"
    }
  );

  return {
    open(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "route") panelState.selectedRouteId = normalizeRouteId(selection.object.id);
      if (!routeExists(map, panelState.selectedRouteId)) panelState.selectedRouteId = firstRouteId(map);
      panelState.open = true;
      panelState.version++;
      manager.open("route-panel");
      lazyPanel.load();
    },
    update(map, selection, history) {
      panelState.map = map ? markRaw(map) : null;
      panelState.selection = selection;
      panelState.history = history;
      syncPanelHighlightCount(panelState, callbacks);
      if (selection?.object?.kind === "route") panelState.selectedRouteId = normalizeRouteId(selection.object.id);
      if (!routeExists(map, panelState.selectedRouteId)) panelState.selectedRouteId = firstRouteId(map);
      panelState.version++;
    },
    setSelectedRouteId(routeId) {
      const normalized = normalizeRouteId(routeId);
      if (routeExists(panelState.map, normalized)) panelState.selectedRouteId = normalized;
    },
    setCreateMode(active) {
      panelState.createMode = Boolean(active);
    },
    isOpen() {
      return panelState.open;
    },
    unmount() {
      lazyPanel.unmount();
    }
  };
}

function routeObject(row) {
  return {
    kind: "route",
    id: row.id,
    type: row.type,
    level: row.level,
    fromId: row.fromId,
    toId: row.toId,
    from: row.fromName,
    to: row.toName,
    length: roundNumber(row.length),
    segments: row.segments
  };
}

function routeExists(map, routeId) {
  routeId = normalizeRouteId(routeId);
  return Boolean(Number.isInteger(routeId) && (map?.settlements?.routes || []).some(route => route.id === routeId));
}

function normalizeRouteId(routeId) {
  return toIntegerId(routeId);
}

function firstRouteId(map) {
  return map?.settlements?.routes?.[0]?.id ?? null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
